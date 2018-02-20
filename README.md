zendesk-incident-protector
===

[![GitHub version](https://badge.fury.io/gh/xflagstudio%2Fzendesk-incident-protector.svg)](https://badge.fury.io/gh/xflagstudio%2Fzendesk-incident-protector)
[![CircleCI](https://circleci.com/gh/xflagstudio/zendesk-incident-protector.svg?style=shield)](https://circleci.com/gh/xflagstudio/zendesk-incident-protector)
![MIT License](http://img.shields.io/badge/license-MIT-blue.svg?style=flat)

## Description

Userscript which is useful for prevent replying to customer with specific NG keywords on Zendesk.

## Before to install

**Install Tampermonkey to your browser**

[TamperMonkey](https://tampermonkey.net/) is required for this userscript.

**Set up JSON file for configuration**

`zendesk-incident-protector.user.js` fetches configuration from JSON to define NG keywords.

So you must set up JSON file to configure your protection settings. Here is an example.

```json
{
    "hosts": [
        "aaa.zendesk.com",
        "bbb.zendesk.com"
    ],
    "targetWords": {
        "common": ["hoge", "huga"],
        "aaa.zendesk.com": ["piyo"],
        "bbb.zendesk.com": ["moge"]
    }
}
```

`zendesk-incident-protector.user.js` requires configuration with two attributes.

* `hosts` : target hosts to protect.
* `targetWords` : target words to trigger alert. Words will be selected from `common` attribute and matched Zendesk host.

Be sure to minify JSON before uploading.

## Install

Just click [here](https://github.com/xflagstudio/zendesk-incident-protector/raw/1.0.0/zendesk-incident-protector.user.js).

Then confirmation window of tampermonkey will be displayed on your browser.

## Usage

At first, you must define configuration URL with confirm prompt.

Then, `zendesk-incident-protector.user.js` set NG keyword validator based on configuration.

When you attempt to send reply to customer, validator will check contents and show alert if contents include NG keyword.

## FAQ

**How to redefine configuration URL?**

Configuration URL is stored on localStorage of your browser. So you can reset URL by clear cache on browser, or type below on developer console.

```javascript
localStorage.removeItem("zendeskIncidentProtectorConfigURL");
```

## Author

[XFLAG Studio](https://career.xflag.com/) CRE Team
