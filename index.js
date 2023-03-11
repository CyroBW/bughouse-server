//'use strict';
import { chromium } from "playwright-core";
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { Instance } from "./instance.js";

const app = express();
const port = process.env.PORT || 8080;

let instances = {}; 

const server = http.createServer(app);
server.listen(port);

const wss = new WebSocketServer({ server: server });
const browser = await chromium.launch({ chromiumSandbox: false });

wss.on("connection", async function connection(ws, req) {
    setInterval(function() {
      ws.send("ping");
    }, 30000);
    
    let ip = req.socket.remoteAddress; 
    console.log(ip + " connected!"); 
    const credentials = req.url.split('?')[1].split('&'); 
    const username = credentials[0].split('=')[1];
    const password = credentials[1].split('=')[1];

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'
    });
    instances[ip] = new Instance(ws, context, username, password); 
    await instances[ip].start();
  });              

