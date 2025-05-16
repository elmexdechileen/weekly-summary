name: Release Weekly Summarizer Plugin

on:
  push:
    tags:
      - '*'

env:
  PLUGIN_NAME: weekly-summarizer

jobs:
  build:
    runs-on: ubuntu-latest
    permissions: write-all

    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18.x'

      - name: Install dependencies
        run: yarn install

      - name: Build the plugin
        run: |
          yarn build
          mkdir -p ${{ env.PLUGIN_NAME }}
          cp -r build/* ${{ env.PLUGIN_NAME }}/
          cp manifest.json ${{ env.PLUGIN_NAME }}/
          cp versions.json ${{ env.PLUGIN_NAME }}/ || true
          zip -r ${{ env.PLUGIN_NAME }}.zip ${{ env.PLUGIN_NAME }}

      - name: Get the latest tag
        id: get_tag
        run: echo "tag_name=$(git describe --tags --abbrev=0)" >> $GITHUB_ENV

      - name: Create Release
        id: create_release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ env.tag_name }}
          release_name: ${{ env.tag_name }}
          draft: false
          prerelease: false

      - name: Upload Plugin Zip
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./${{ env.PLUGIN_NAME }}.zip
          asset_name: ${{ env.PLUGIN_NAME }}-${{ env.tag_name }}.zip
          asset_content_type: application/zip

      - name: Upload main.js
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: build/main.js
          asset_name: main.js
          asset_content_type: text/javascript

      - name: Upload manifest.json
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./manifest.json
          asset_name: manifest.json
          asset_content_type: application/json

      - name: Upload versions.json
        if: exists('./versions.json')
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./versions.json
          asset_name: versions.json
          asset_content_type: application/json
