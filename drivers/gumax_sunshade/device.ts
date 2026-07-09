import Homey from 'homey';
import type { Signal433 } from 'homey';
import { CMD, buildFrame, channelsOverlap, decodeFrame, normalizeCommand } from './protocol';

const SIGNAL_TX_ID = 'gumax_shutter';
const SIGNAL_RX_ID = 'gumax_shutter_rx';
const STORE_REMOTE_ID = 'remoteId';
const STORE_CHANNEL_MASK = 'channelMask';

/** Maps windowcoverings_state values to the primary command to transmit. */
const STATE_TO_COMMAND: Readonly<Record<string, number>> = {
  up: CMD.OPEN,
  down: CMD.CLOSE,
};

/** Maps received (normalized) commands back to windowcoverings_state values. */
const COMMAND_TO_STATE: Readonly<Record<number, string>> = {
  [CMD.OPEN]: 'up',
  [CMD.CLOSE]: 'down',
  [CMD.STOP_SUSTAINED]: 'idle',
};

class GumaxSunshadeDevice extends Homey.Device {
  private signalRx?: Signal433;

  /**
   * Mirror commands sent by the physical remote into the device state.
   * Declared as an arrow property so the exact same reference can be
   * removed again in {@link detachRx}.
   */
  private readonly handleRxPayload = (payload: number[], first: boolean): void => {
    if (!first) return;

    const frame = decodeFrame(payload);
    if (frame === null) return;

    if (frame.remoteId !== this.getStoreValue(STORE_REMOTE_ID)) return;

    const ownMask = this.getStoreValue(STORE_CHANNEL_MASK) as number | null;
    if (typeof ownMask !== 'number' || !channelsOverlap(frame.channelMask, ownMask)) return;

    const command = normalizeCommand(frame.command);
    const state = COMMAND_TO_STATE[command];
    if (state === undefined) return;

    this.log(`RX cmd=0x${frame.command.toString(16)} → state=${state}`);
    this.setCapabilityValue('windowcoverings_state', state).catch((err) => this.error(err));
  };

  override async onInit(): Promise<void> {
    this.log(`Gumax sunshade initialized: ${this.getName()}`);

    this.registerCapabilityListener('windowcoverings_state', (value: string) =>
      this.onCapabilityWindowCoveringsState(value),
    );

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

  private async onCapabilityWindowCoveringsState(state: string): Promise<void> {
    if (state === 'idle') {
      // Mirror the physical remote's stop burst: the initial code first,
      // then the sustained code — the motor only acts on the latter.
      await this.transmit(CMD.STOP_INITIAL);
      await this.transmit(CMD.STOP_SUSTAINED);
      return;
    }

    const command = STATE_TO_COMMAND[state];
    if (command === undefined) throw new Error(`Unknown state: ${state}`);
    await this.transmit(command);
  }

  private async transmit(command: number): Promise<void> {
    const remoteId = this.getStoreValue(STORE_REMOTE_ID) as number | null;
    const channelMask = this.getStoreValue(STORE_CHANNEL_MASK) as number | null;

    if (typeof remoteId !== 'number' || typeof channelMask !== 'number') {
      throw new Error('Device is missing its remote ID or channel — please remove and pair it again');
    }

    this.log(
      `TX cmd=0x${command.toString(16)} remote=0x${remoteId.toString(16).padStart(8, '0')} ` +
        `mask=0x${channelMask.toString(16).padStart(4, '0')}`,
    );
    await this.homey.rf.getSignal433(SIGNAL_TX_ID).tx(buildFrame(remoteId, channelMask, command));
  }
}

export = GumaxSunshadeDevice;
