import Homey from 'homey';
import { AOK_CMD_DOWN, AOK_CMD_STOP, AOK_CMD_UP, buildFrame } from './aok';

const SIGNAL_ID = 'aok';

export default class GumaxShadeDevice extends Homey.Device {
  async onInit(): Promise<void> {
    this.log(`Gumax sunshade device initialized: ${this.getName()}`);
    this.registerCapabilityListener('windowcoverings_state', this.onWindowCoveringsState.bind(this));
  }

  private async onWindowCoveringsState(value: string): Promise<void> {
    switch (value) {
      case 'up':   return this.cmdUp();
      case 'down': return this.cmdDown();
      case 'idle': return this.cmdStop();
      default: throw new Error(`Unknown state: ${value}`);
    }
  }

  async cmdUp(): Promise<void> {
    await this.transmit(AOK_CMD_UP);
    await this.setCapabilityValue('windowcoverings_state', 'up').catch(this.error.bind(this));
  }

  async cmdStop(): Promise<void> {
    await this.transmit(AOK_CMD_STOP);
    await this.setCapabilityValue('windowcoverings_state', 'idle').catch(this.error.bind(this));
  }

  async cmdDown(): Promise<void> {
    await this.transmit(AOK_CMD_DOWN);
    await this.setCapabilityValue('windowcoverings_state', 'down').catch(this.error.bind(this));
  }

  private async transmit(command: number): Promise<void> {
    const remoteId = this.getStoreValue('remoteId') as number | null;
    const channel  = this.getStoreValue('channel')  as number | null;

    if (remoteId == null || channel == null) {
      throw new Error('Device not paired: missing remoteId or channel');
    }

    const frame  = buildFrame(remoteId, channel, command);
    const signal = this.homey.rf.getSignal433(SIGNAL_ID);

    this.log(`TX cmd=0x${command.toString(16)} remote=0x${remoteId.toString(16)} ch=0x${channel.toString(16)}`);
    await signal.tx(frame);
  }
}
