import Homey from 'homey';
import type { Signal433 } from 'homey';
import { CMD, DIM_STEP, buildFrame, commandToDim, decodeFrame, dimToCommand } from './protocol';

const SIGNAL_TX_ID = 'gumax';
const SIGNAL_RX_ID = 'gumax_rx';
const STORE_REMOTE_ID = 'remoteId';

class GumaxLedSpotDevice extends Homey.Device {
  private signalRx?: Signal433;

  /**
   * Mirror commands sent by the physical remote into the device state.
   * Declared as an arrow property so the exact same reference can be
   * removed again in {@link detachRx}.
   */
  private readonly handleRxPayload = (payload: number[], first: boolean): void => {
    if (!first) return;

    const frame = decodeFrame(payload);
    if (frame === null || frame.remoteId !== this.getStoreValue(STORE_REMOTE_ID)) return;

    this.log(`RX cmd=0x${frame.command.toString(16)}`);
    this.applyCommand(frame.command).catch((err) => this.error(err));
  };

  override async onInit(): Promise<void> {
    this.log(`Gumax LED spot initialized: ${this.getName()}`);

    this.registerCapabilityListener('onoff', (value: boolean) => this.onCapabilityOnoff(value));
    this.registerCapabilityListener('dim', (value: number) => this.onCapabilityDim(value));

    this.signalRx = this.homey.rf.getSignal433(SIGNAL_RX_ID);
    this.signalRx.on('payload', this.handleRxPayload);
  }

  override async onUninit(): Promise<void> {
    this.detachRx();
  }

  override async onDeleted(): Promise<void> {
    this.detachRx();
  }

  private detachRx(): void {
    this.signalRx?.removeListener('payload', this.handleRxPayload);
  }

  private async onCapabilityOnoff(on: boolean): Promise<void> {
    await this.transmit(on ? CMD.ON : CMD.OFF);
  }

  private async onCapabilityDim(dim: number): Promise<void> {
    if (dim === 0) {
      await this.transmit(CMD.OFF);
      await this.syncCapability('onoff', false);
      return;
    }

    // The controller ignores level commands while off, so wake it first.
    if (this.getCapabilityValue('onoff') !== true) {
      await this.transmit(CMD.ON);
    }

    await this.transmit(dimToCommand(dim));
    await this.syncCapability('onoff', true);
  }

  /** Update capability state after a command received from the physical remote. */
  private async applyCommand(command: number): Promise<void> {
    switch (command) {
      case CMD.ON:
        await this.setCapabilityValue('onoff', true);
        return;

      case CMD.OFF:
        await this.setCapabilityValue('onoff', false);
        await this.setCapabilityValue('dim', 0);
        return;

      case CMD.HIGHER:
      case CMD.LOWER: {
        const step = command === CMD.HIGHER ? DIM_STEP : -DIM_STEP;
        const current = (this.getCapabilityValue('dim') as number | null) ?? 0;
        const dim = Math.min(1, Math.max(0, current + step));
        await this.setCapabilityValue('dim', dim);
        await this.setCapabilityValue('onoff', dim > 0);
        return;
      }

      default: {
        const dim = commandToDim(command);
        if (dim !== null) {
          await this.setCapabilityValue('dim', dim);
          await this.setCapabilityValue('onoff', true);
        }
      }
    }
  }

  /** Update a capability without letting a UI sync failure fail the whole command. */
  private async syncCapability(capabilityId: string, value: unknown): Promise<void> {
    try {
      await this.setCapabilityValue(capabilityId, value);
    } catch (err) {
      this.error(`Failed to sync capability "${capabilityId}":`, err);
    }
  }

  private async transmit(command: number): Promise<void> {
    const remoteId = this.getStoreValue(STORE_REMOTE_ID) as number | null;
    if (typeof remoteId !== 'number') {
      throw new Error('Device is missing its remote ID — please remove and pair it again');
    }

    this.log(`TX cmd=0x${command.toString(16)} remote=0x${remoteId.toString(16).padStart(5, '0')}`);
    await this.homey.rf.getSignal433(SIGNAL_TX_ID).tx(buildFrame(remoteId, command));
  }
}

export = GumaxLedSpotDevice;
