import Homey from 'homey';

/**
 * Gumax app — controls Gumax LED spots and motorised sunshades over 433 MHz
 * by replaying the protocol of the original ASY-3501-1 remotes.
 */
class GumaxApp extends Homey.App {
  override async onInit(): Promise<void> {
    this.log('Gumax app initialized');
  }
}

export = GumaxApp;
