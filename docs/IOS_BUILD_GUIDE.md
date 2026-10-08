# iOS IPA Build & Installation Guide

This document explains how to build the iOS `.ipa` package for **Babin Rentals OS** using GitHub Actions and install it on an iPhone or iPad directly from your Windows Desktop.

---

## 1. Why GitHub Actions for iOS Builds?

Apple requires macOS and Xcode to compile iOS apps into native ARM64 executables. Because development is done on Windows, **GitHub Actions** provides free macOS runners (`macos-14`) with Xcode and CocoaPods pre-installed.

The automated workflow is located at:
[`.github/workflows/build-ios.yml`](../.github/workflows/build-ios.yml)

---

## 2. Triggering the Build

1. Push your latest commits to your GitHub repository:
   ```bash
   git add .
   git commit -m "feat(ios): add iOS build workflow and capacitor config"
   git push origin main
   ```
2. In your browser, navigate to your repository on GitHub.
3. Click on the **Actions** tab at the top.
4. In the left sidebar, click **Build iOS IPA**.
5. Click the **Run workflow** dropdown on the right:
   - Choose the branch (e.g. `main`).
   - Select the build mode (`production` or `mock`).
   - Click the green **Run workflow** button.
6. The macOS runner will execute the pipeline (typically 3–5 minutes):
   - Compiles web assets with Vite.
   - Syncs the iOS Capacitor project.
   - Compiles and archives with `xcodebuild`.
   - Packages `Payload/App.app` into `BabinRentalsOS.ipa`.
   - Uploads the finished artifact.

---

## 3. Downloading to Your Windows Desktop

1. Once the workflow run shows a green checkmark, click into the run.
2. Scroll to the bottom to the **Artifacts** section.
3. Click on **BabinRentalsOS-iOS-IPA**.
4. A zip file will download. Unzip it directly to your **Desktop** (`C:\Users\babin\Desktop\`) to extract `BabinRentalsOS.ipa`.

---

## 4. Installing the `.ipa` onto iPhone / iPad (Windows Desktop)

You do **not** need a paid Apple Developer account to install the IPA on your personal device. Use one of the free sideloading tools below:

### Method A: Sideloadly (Easiest & Free)
1. Download and install [Sideloadly](https://sideloadly.io/) on Windows.
2. Connect your iPhone or iPad to your PC using a Lightning or USB-C cable.
3. Open Sideloadly. Ensure your device appears in the device selector.
4. Drag and drop `BabinRentalsOS.ipa` from your Desktop into the Sideloadly IPA box.
5. Enter your regular Apple ID and password (used strictly to generate a 7-day free developer signature).
6. Click **Start**. Sideloadly will sign and install the app onto your device.
7. On your iOS device:
   - Go to **Settings > General > VPN & Device Management**.
   - Tap your Apple ID under Developer App.
   - Tap **Trust "[your Apple ID]"**.
8. Launch **Babin Rentals OS** from your home screen.

### Method B: AltStore
1. Install [AltServer](https://altstore.io/) on Windows.
2. Install AltStore onto your iOS device.
3. Transfer or AirDrop/download `BabinRentalsOS.ipa` to the Files app on iOS.
4. In AltStore, go to **My Apps > '+'** and select `BabinRentalsOS.ipa` to install.

### Method C: TrollStore (For Compatible iOS Versions)
If your device runs an iOS version supported by TrollStore, simply open `BabinRentalsOS.ipa` in TrollStore for permanent, unsigned installation without expiration.
