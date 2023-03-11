//'use strict';
import { chromium } from "playwright-core";

(async () => {
    const browser = await chromium.launch({ chromiumSandbox: false });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'
    });
    const instance = new Instance(context, username, password); 
    await instance.start();
  })();
