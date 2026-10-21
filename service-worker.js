
name: Build SEBY RUNNER APK

on:
  workflow_dispatch:
  push:
    branches:
      - main
      - master

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Get project files
        uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install Capacitor and icon tools
        run: |
          npm init -y
          npm install @capacitor/core@7 @capacitor/cli@7 @capacitor/android@7 @capacitor/assets@3.0.5 sharp

      - name: Prepare game files
        run: |
          mkdir -p www assets
          cp index.html style.css games.js manifest.json service-worker.js www/

          if [ -f icon-192.png ]; then
            cp icon-192.png www/
          fi

          if [ -f icon-512.png ]; then
            cp icon-512.png www/
          else
            echo "ERROR: icon-512.png is missing from repository root."
            exit 1
          fi

          node -e "require('sharp')('icon-512.png').resize(1024,1024).png().toFile('assets/icon.png').then(()=>console.log('Source icon prepared.')).catch(e=>{console.error(e);process.exit(1)})"

      - name: Configure Android app
        run: |
          cat > capacitor.config.json <<'EOF'
          {
            "appId": "com.seby.runner",
            "appName": "SEBY RUNNER",
            "webDir": "www"
          }
          EOF

      - name: Create Android project
        run: |
          npx cap add android

      - name: Generate SEBY RUNNER app icons
        run: |
          npx capacitor-assets generate --android --assetPath assets

      - name: Sync Android resources
        run: |
          npx cap sync android

      - name: Build APK
        run: |
          cd android
          chmod +x gradlew
          ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: SEBY-RUNNER-APK
          path: android/app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
