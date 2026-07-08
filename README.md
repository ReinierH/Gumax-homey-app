# Gumax Homey App

Control Gumax LED spots and motorised sunshading systems from [Homey](https://homey.app) by learning your existing ASY-3501-1 remote.

## Supported devices

| Device | Capabilities |
|---|---|
| Gumax LED Spot (ASY-3501-1) | On/off, 6 brightness levels |
| Gumax Sunshade / Shutter | Open, close, stop — up to 16 channels |

The app works by learning your existing physical remote. No hub or Wi-Fi adapter required — Homey's built-in 433 MHz radio handles all communication.

## Manual installation via Homey CLI

### Prerequisites

- [Node.js](https://nodejs.org) 18 or higher
- Homey CLI: `npm install -g homey`
- A Homey Pro (2023 or later) on firmware ≥ 12.0.0

### Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/ReinierH/Gumax-homey-app.git
   cd Gumax-homey-app
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Log in to your Homey account**

   ```bash
   homey login
   ```

4. **Run the app on your Homey** (installs and starts, shows live logs)

   ```bash
   homey app run
   ```

   Or install without attaching to the log stream:

   ```bash
   homey app install
   ```

### Pairing a device

#### LED Spot

1. In Homey, go to **Devices → Add device → Gumax → Gumax LED Spot**.
2. Press **Start**, then press any button on your ASY-3501-1 remote within 30 seconds.
3. Homey learns the remote ID and adds the device.

#### Sunshade / Shutter

1. Select the desired **channel** on your Gumax remote first.
2. In Homey, go to **Devices → Add device → Gumax → Gumax Sunshade**.
3. Press **Start**, then press Open, Close, or Stop on your remote.
4. Homey learns both the remote ID and the channel, and names the device accordingly (e.g. "Gumax Zonwering — Kanaal 2").

To control all shutters at once, use the **All channels** button on the remote during pairing.

## App store publishing checklist

The CLI validation (`homey app validate --level publish`) passes, but the following must be completed before submitting to the Homey App Store:

### Images

- [ ] **Sunshade driver images** — the current images in `drivers/gumax_sunshade/assets/images/` are placeholders. Replace with real images:
  - `small.png` — 75×75 px
  - `large.png` — 500×500 px
  - `xlarge.png` — 1000×1000 px
  
  Should show a clean icon of a motorised sunshade/blind on a transparent or white background.

### Testing

- [ ] **End-to-end pairing test for the sunshade driver** — verify that learning a remote, controlling open/close/stop, and physical remote state sync all work reliably on a real Gumax motor.
- [ ] **Multi-channel test** — verify that pairing on individual channels and the "all channels" button both work correctly.
- [ ] **LED spot pairing test** — confirm the RF learning flow works end-to-end on a fresh Homey install.

### Submission

- [ ] Run `homey app publish` and complete the store submission form.
- [ ] Add a support URL or contact email to the app store listing.

---

## Development

```bash
# Type-check
npx tsc --noEmit

# Build (compiles TypeScript + validates app)
homey app build

# Validate against Homey store requirements
homey app validate --level publish
```
