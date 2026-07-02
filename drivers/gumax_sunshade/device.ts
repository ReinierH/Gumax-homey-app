import Homey from 'homey';
import {
  buildFrame, decodeFrame,
  CMD_OPEN, CMD_CLOSE, CMD_STOP,
  channelMatches, normalizePrimary,
} from './protocol';

const SIGNAL_TX_ID = 'gumax_shutter';
const SIGNAL_RX_ID = 'gumax_shutter_rx';

class GumaxShadeDevice extends Homey.Device {
  private signalRx!: ReturnType<typeof this.homey.rf.getSignal433>;

  private readonly onSignalPayload = (payload: number[], first: boolean): void => {
    if (!first) return;

    const frame = decodeFrame(payload);
    if (!frame) return;

    const remoteId    = this.getStoreValue('remoteId')    as number | null;
    const channelMask = this.getStoreValue('channelMask') as number | null;

    if (frame.remoteId !== remoteId) return;
    if (channelMask == null || !channelMatches(frame.channelMask, channelMask)) return;

    const primary = normalizePrimary(frame.command);
    this.log(`RX cmd=0x${frame.command.toString(16)} → primary=0x${primary.toString(16)}`);
    this.updateStateFromCommand(primary).catch(this.error.bind(this));
  };

  async onInit(): Promise<void> {
    this.log(`Gumax sunshade device initialized: ${this.getName()}`);
    this.registerCapabilityListener('windowcoverings_state', this.onWindowCoveringsState.bind(this));

    this.signalRx = this.homey.rf.getSignal433(SIGNAL_RX_ID);
    this.signalRx.on('payload', this.onSignalPayload);
  }

  async onDeleted(): Promise<void> {
    this.signalRx.removeListener('payload', this.onSignalPayload);
  }

  private async updateStateFromCommand(command: number): Promise<void> {
    switch (command) {
      case CMD_OPEN:
        await this.setCapabilityValue('windowcoverings_state', 'up');
        break;
      case CMD_CLOSE:
        await this.setCapabilityValue('windowcoverings_state', 'down');
        break;
      case CMD_STOP:
        await this.setCapabilityValue('windowcoverings_state', 'idle');
        break;
    }
  }

  private async onWindowCoveringsState(value: string): Promise<void> {
    switch (value) {
      case 'up':   return this.transmit(CMD_OPEN);
      case 'down': return this.transmit(CMD_CLOSE);
      case 'idle': return this.transmit(CMD_STOP);
      default: throw new Error(`Unknown state: ${value}`);
    }
  }

  private async transmit(command: number): Promise<void> {
    const remoteId    = this.getStoreValue('remoteId')    as number | null;
    const channelMask = this.getStoreValue('channelMask') as number | null;

    if (remoteId == null || channelMask == null) {
      throw new Error('Device not paired: missing remoteId or channelMask');
    }

    const frame  = buildFrame(remoteId, channelMask, command);
    const signal = this.homey.rf.getSignal433(SIGNAL_TX_ID);

    this.log(`TX cmd=0x${command.toString(16)} remote=0x${remoteId.toString(16).padStart(8, '0')} mask=0x${channelMask.toString(16).padStart(4, '0')}`);
    await signal.tx(frame);
  }
}

export = GumaxShadeDevice;
