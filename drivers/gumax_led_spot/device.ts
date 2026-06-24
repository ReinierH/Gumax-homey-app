import Homey from 'homey';

const SIGNAL_ID = 'aok';

export default class GumaxDevice extends Homey.Device {
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
    await this.transmit('onCode');
    await this.setCapabilityValue('onoff', true).catch(this.error.bind(this));
  }

  async cmdOff(): Promise<void> {
    await this.transmit('offCode');
    await this.setCapabilityValue('onoff', false).catch(this.error.bind(this));
  }

  private async transmit(storeKey: 'onCode' | 'offCode'): Promise<void> {
    const payload = this.getStoreValue(storeKey) as number[] | null;

    if (!payload || payload.length === 0) {
      throw new Error(`No ${storeKey} stored for this device`);
    }

    const signal = this.homey.rf.getSignal433(SIGNAL_ID);
    this.log(`TX ${storeKey} (${payload.length} bits)`);
    await signal.tx(payload);
  }
}
