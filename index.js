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

wss.on("connection", async function connection(ws, req) {
    setInterval(function() {
      ws.send("ping");
    }, 30000);
    
    let ip = req.socket.remoteAddress; 
    console.log(ip + " connected!"); 
    const credentials = req.url.split('?')[1].split('&'); 
    const username = credentials[0].split('=')[1];
    const password = credentials[1].split('=')[1];

    const browser = await chromium.launch({ chromiumSandbox: false });
    instances[ip] = new Instance(ws, browser, username, password); 
    await instances[ip].start();
  });              

