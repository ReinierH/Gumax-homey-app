import Homey from 'homey';
import { buildFrame, CMD_ON, CMD_OFF } from './protocol';

const SIGNAL_ID = 'gumax';

export default class GumaxLedDevice extends Homey.Device {
  async onInit(): Promise<void> {
    this.log(`Gumax LED device initialized: ${this.getName()}`);
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
  }

  private async onCapabilityOnoff(value: boolean): Promise<void> {
    if (value) {
      await this.cmdOn();
    } else {
      await this.cmdOff();
    }
  }

  async cmdOn(): Promise<void> {
    await this.transmit(CMD_ON);
    await this.setCapabilityValue('onoff', true).catch(this.error.bind(this));
  }

  async cmdOff(): Promise<void> {
    await this.transmit(CMD_OFF);
    await this.setCapabilityValue('onoff', false).catch(this.error.bind(this));
  }

  private async transmit(command: number): Promise<void> {
    const remoteId = this.getStoreValue('remoteId') as number | null;
    if (remoteId == null) throw new Error('Device not paired: missing remoteId');

    const frame  = buildFrame(remoteId, command);
    const signal = this.homey.rf.getSignal433(SIGNAL_ID);

    this.log(`TX cmd=0x${command.toString(16)} remote=0x${remoteId.toString(16).padStart(5, '0')}`);
    await signal.tx(frame);
  }
}
