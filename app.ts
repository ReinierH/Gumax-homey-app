import Homey from 'homey';

class GumaxApp extends Homey.App {
  async onInit(): Promise<void> {
    this.log('Gumax Sunshading app initialized');
  }
}

module.exports = GumaxApp;
