import Homey from 'homey';
import { formatPayload } from '../../lib/bits';
import { learnFrame } from '../../lib/learn';
import { CHANNEL_ALL, CHANNEL_COUNT, decodeFrame } from './protocol';

const SIGNAL_RX_ID = 'gumax_shutter_rx';
const LEARN_TIMEOUT_MS = 30_000;

interface LearnedDevice {
  name: string;
  data: { id: string };
  store: { remoteId: number; channelMask: number };
}

class GumaxSunshadeDriver extends Homey.Driver {
  override async onInit(): Promise<void> {
    this.log('Gumax sunshade driver initialized');

    // RX stays enabled for the lifetime of the app so paired devices can
    // mirror physical remote presses into their capability state.
    this.homey.rf
      .getSignal433(SIGNAL_RX_ID)
      .enableRX()
      .catch((err) => this.error('Failed to enable RX:', err));
  }

  override async onPair(session: Homey.Driver.PairSession): Promise<void> {
    let learned: LearnedDevice | null = null;

    session.setHandler('learn', async (): Promise<void> => {
      this.log(`[learn] listening on "${SIGNAL_RX_ID}"`);

      const frame = await learnFrame({
        signal: this.homey.rf.getSignal433(SIGNAL_RX_ID),
        decode: decodeFrame,
        timeoutMs: LEARN_TIMEOUT_MS,
        timeoutMessage: this.homey.__('pair.shade.timeout'),
        onPayload: (payload, first) => this.log(`[learn] first=${first} ${formatPayload(payload)}`),
      });

      const label = this.channelLabel(frame.channelMask);
      this.log(
        `[learn] learned remote=0x${frame.remoteId.toString(16).padStart(8, '0')} ` +
          `mask=0x${frame.channelMask.toString(16).padStart(4, '0')} (${label}) ` +
          `cmd=0x${frame.command.toString(16)}`,
      );

      learned = {
        name: `${this.homey.__('pair.shade.device_name')} — ${label}`,
        data: {
          id: `${frame.remoteId.toString(16).padStart(8, '0')}-${frame.channelMask.toString(16).padStart(4, '0')}`,
        },
        store: { remoteId: frame.remoteId, channelMask: frame.channelMask },
      };
    });

    session.setHandler('list_devices', async (): Promise<LearnedDevice[]> => (learned ? [learned] : []));
  }

  /** Human-readable, localized label for a channel mask, e.g. "Channel 2" or "All channels". */
  private channelLabel(channelMask: number): string {
    if (channelMask === CHANNEL_ALL) return this.homey.__('pair.shade.all_channels');

    const channels: number[] = [];
    for (let bit = 0; bit < CHANNEL_COUNT; bit++) {
      if (channelMask & (1 << bit)) channels.push(bit + 1);
    }

    const prefix = this.homey.__(channels.length === 1 ? 'pair.shade.channel' : 'pair.shade.channels');
    return `${prefix} ${channels.join(', ')}`;
  }
}

export = GumaxSunshadeDriver;
