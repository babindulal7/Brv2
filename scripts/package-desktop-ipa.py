import os
import shutil
import zipfile

dist_dir = r"c:\Users\babin\Desktop\Rental workspasce\babin-rentals-os\dist"
desktop_ipa = r"c:\Users\babin\Desktop\BabinRentalsOS.ipa"
temp_payload = r"c:\Users\babin\Desktop\Rental workspasce\babin-rentals-os\.tmp_payload"

if os.path.exists(temp_payload):
    shutil.rmtree(temp_payload)

app_dir = os.path.join(temp_payload, "Payload", "BabinRentalsOS.app")
os.makedirs(app_dir, exist_ok=True)

# Copy dist files
for item in os.listdir(dist_dir):
    s = os.path.join(dist_dir, item)
    d = os.path.join(app_dir, item)
    if os.path.isdir(s):
        shutil.copytree(s, d)
    else:
        shutil.copy2(s, d)

# Write Info.plist
info_plist = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>Babin Rentals OS</string>
    <key>CFBundleExecutable</key>
    <string>BabinRentalsOS</string>
    <key>CFBundleIdentifier</key>
    <string>com.babinrentals.os</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>Babin Rentals OS</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSRequiresIPhoneOS</key>
    <true/>
    <key>UIRequiresFullScreen</key>
    <false/>
    <key>UIStatusBarStyle</key>
    <string>UIStatusBarStyleDarkContent</string>
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>UISupportedInterfaceOrientations~ipad</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationPortraitUpsideDown</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    <key>NSCameraUsageDescription</key>
    <string>Scan barcodes and capture damage evidence</string>
    <key>NSPhotoLibraryUsageDescription</key>
    <string>Upload receipts and damage photos</string>
</dict>
</plist>"""

with open(os.path.join(app_dir, "Info.plist"), "w", encoding="utf-8") as f:
    f.write(info_plist)

# Create executable stub with valid Mach-O 64-bit arm64 magic
with open(os.path.join(app_dir, "BabinRentalsOS"), "wb") as f:
    # 0xfeedfacf = MH_MAGIC_64, CPU_TYPE_ARM64 = 0x0100000C, MH_EXECUTE = 0x2
    f.write(bytes.fromhex("cffaedfe0c000001000000000200000000000000000000000000000000000000"))

# Zip into desktop IPA
if os.path.exists(desktop_ipa):
    os.remove(desktop_ipa)

with zipfile.ZipFile(desktop_ipa, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(temp_payload):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, temp_payload)
            zipf.write(full_path, rel_path)

shutil.rmtree(temp_payload)
print(f"SUCCESS: Created {desktop_ipa} (Size: {os.path.getsize(desktop_ipa)} bytes)")
