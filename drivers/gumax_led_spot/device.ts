import Homey from 'homey';
import {
  buildFrame, decodeFrame,
  CMD_ON, CMD_OFF, CMD_HIGHER, CMD_LOWER,
  DIM_LEVELS, dimToLevelIndex, CMD_TO_DIM,
} from './protocol';

const SIGNAL_TX_ID = 'gumax';
const SIGNAL_RX_ID = 'gumax_rx';

class GumaxLedDevice extends Homey.Device {
  private signalRx!: ReturnType<typeof this.homey.rf.getSignal433>;

  // Stored as a property so we can remove the exact same reference in onDeleted.
  private readonly onSignalPayload = (payload: number[], first: boolean): void => {
    if (!first) return;

    const frame = decodeFrame(payload);
    if (!frame) return;

    const remoteId = this.getStoreValue('remoteId') as number | null;
    if (frame.remoteId !== remoteId) return;

    this.log(`RX cmd=0x${frame.command.toString(16)}`);
    this.updateStateFromCommand(frame.command).catch(this.error.bind(this));
  };

  async onInit(): Promise<void> {
    this.log(`Gumax LED device initialized: ${this.getName()}`);
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('dim',   this.onCapabilityDim.bind(this));

    this.signalRx = this.homey.rf.getSignal433(SIGNAL_RX_ID);
    this.signalRx.on('payload', this.onSignalPayload);
  }

  async onDeleted(): Promise<void> {
    this.signalRx.removeListener('payload', this.onSignalPayload);
  }

  private async updateStateFromCommand(command: number): Promise<void> {
    switch (command) {
      case CMD_ON:
        await this.setCapabilityValue('onoff', true);
        break;

      case CMD_OFF:
        await this.setCapabilityValue('onoff', false);
        await this.setCapabilityValue('dim', 0);
        break;

      case CMD_HIGHER: {
        const current = (this.getCapabilityValue('dim') as number) ?? 0;
        await this.setCapabilityValue('dim', Math.min(1, current + 1 / 6));
        await this.setCapabilityValue('onoff', true);
        break;
      }

      case CMD_LOWER: {
        const current = (this.getCapabilityValue('dim') as number) ?? 1 / 6;
        const next = Math.max(0, current - 1 / 6);
        await this.setCapabilityValue('dim', next);
        if (next === 0) await this.setCapabilityValue('onoff', false);
        break;
      }

      default: {
        const dim = CMD_TO_DIM[command];
        if (dim !== undefined) {
          await this.setCapabilityValue('dim', dim);
          await this.setCapabilityValue('onoff', true);
        }
        break;
      }
    }
  }

  private async onCapabilityOnoff(value: boolean): Promise<void> {
    await this.transmit(value ? CMD_ON : CMD_OFF);
  }

  private async onCapabilityDim(value: number): Promise<void> {
    if (value === 0) {
      await this.transmit(CMD_OFF);
      await this.setCapabilityValue('onoff', false).catch(this.error.bind(this));
      return;
    }
    const isOn = this.getCapabilityValue('onoff') as boolean;
    if (!isOn) {
      await this.transmit(CMD_ON);
      await this.setCapabilityValue('onoff', true).catch(this.error.bind(this));
    }
    await this.transmit(DIM_LEVELS[dimToLevelIndex(value)]);
    await this.setCapabilityValue('onoff', true).catch(this.error.bind(this));
  }

  async cmdOn(): Promise<void> {
    await this.transmit(CMD_ON);
    await this.setCapabilityValue('onoff', true).catch(this.error.bind(this));
  }

  async cmdOff(): Promise<void> {
    await this.transmit(CMD_OFF);
    await this.setCapabilityValue('onoff', false).catch(this.error.bind(this));
  }

  async cmdHigher(): Promise<void> {
    await this.transmit(CMD_HIGHER);
  }

  async cmdLower(): Promise<void> {
    await this.transmit(CMD_LOWER);
  }

  async cmdLevel(level: 1 | 2 | 3 | 4 | 5 | 6): Promise<void> {
    await this.transmit(DIM_LEVELS[level - 1]);
    await this.setCapabilityValue('onoff', true).catch(this.error.bind(this));
    await this.setCapabilityValue('dim', (level - 1) / 5).catch(this.error.bind(this));
  }

  private async transmit(command: number): Promise<void> {
    const remoteId = this.getStoreValue('remoteId') as number | null;
    if (remoteId == null) throw new Error('Device not paired: missing remoteId');

    const frame  = buildFrame(remoteId, command);
    const signal = this.homey.rf.getSignal433(SIGNAL_TX_ID);

    this.log(`TX cmd=0x${command.toString(16)} remote=0x${remoteId.toString(16).padStart(5, '0')}`);
    await signal.tx(frame);
  }
}

export = GumaxLedDevice;
