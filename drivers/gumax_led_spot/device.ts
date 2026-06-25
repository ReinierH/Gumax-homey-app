import Homey from 'homey';
import { buildFrame, CMD_ON, CMD_OFF, CMD_HIGHER, CMD_LOWER, DIM_LEVELS, dimToLevelIndex } from './protocol';

const SIGNAL_ID = 'gumax';

class GumaxLedDevice extends Homey.Device {
  async onInit(): Promise<void> {
    this.log(`Gumax LED device initialized: ${this.getName()}`);
    this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
    this.registerCapabilityListener('dim',   this.onCapabilityDim.bind(this));
  }

  private async onCapabilityOnoff(value: boolean): Promise<void> {
    if (value) {
      await this.transmit(CMD_ON);
    } else {
      await this.transmit(CMD_OFF);
    }
  }

  private async onCapabilityDim(value: number): Promise<void> {
    if (value === 0) {
      await this.transmit(CMD_OFF);
      await this.setCapabilityValue('onoff', false).catch(this.error.bind(this));
      return;
    }
    const cmd = DIM_LEVELS[dimToLevelIndex(value)];
    await this.transmit(cmd);
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
    const signal = this.homey.rf.getSignal433(SIGNAL_ID);

    this.log(`TX cmd=0x${command.toString(16)} remote=0x${remoteId.toString(16).padStart(5, '0')}`);
    await signal.tx(frame);
  }
}

export = GumaxLedDevice;
