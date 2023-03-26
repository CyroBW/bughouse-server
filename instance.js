//'use strict';
import { Board, encode, decode } from './board.js';

export class Instance {
    constructor(context, username, password) {
        this.context = context;
        this.username = username; 
        this.password = password;
        this.board = new Board();
        this.page = null;
        this.gameId = 0; 
        this.sideToMove = 0; 
        this.userSide = 0;
        this.ply = 0; 
        this.startTime = 0;
        this.clientId = '';
        this.opponent = ''; 
        this.whitehand1 = ''; 
        this.blackhand1 = ''; 
        this.whitehand2 = '';
        this.blackhand2 = ''; 
        this.partner = ''; 
        this.following = [];    
        this.playing = false; 
    }

    async start() {
        this.page = await this.context.newPage();
        await this.page.goto('https://www.chess.com/login');
    
        await this.page.type('input[id="username"]', this.username); 
        await this.page.type('input[id="password"]', this.password); 
        await this.page.click('button[id="login"]'),

        await this.page.addInitScript({ path: './hook.js' });
        await this.page.goto('https://www.chess.com/play/online');

        const client = await this.page.context().newCDPSession(this.page);
        await client.send('Network.enable');
        await client.send('Page.enable'); 

        client.on('Network.webSocketFrameReceived', async (message) => {
            if (message.response.payloadData[0] === '[') {
                const data = JSON.parse(message.response.payloadData)[0];
                console.log(data); 

                if ('clientId' in data) {
                    this.clientId = data.clientId;
                    this.seekGame(1800); 
                    //this.sendPartnershipRequest('username'); 
                }
        
                if (data.data && data.data.game && data.data.game.players && data.data.game.clocks) {
                    const players = data.data.game.players;
                    const indexOfUser = players.findIndex((player) => player.uid.toLowerCase() === this.username.toLowerCase());
                    if (indexOfUser !== -1) {    
                        this.gameId = data.data.game.id;
                        this.ply = data.data.game.seq;
                        this.sideToMove = data.data.game.seq % 2 === 0;
                        this.userSide = indexOfUser === 0;
                        if (this.userSide) {
                            this.opponent = players[1].uid; 
                        }
                        else {
                            this.opponent = players[0].uid; 
                        }
                        if (data.data.game.status === 'starting' && data.data.tid === 'FullGame') {
                            this.playing = true; 
                        }
                        const fen = this.board.getFEN(data.data.game.moves, 0);
                        if (fen) { 
                            this.playing = true; 
                        }
                        
                        if (this.whitehand1 !== data.data.game.whitehand) {
                            this.whitehand1 = data.data.game.whitehand; 
                            this.board.setWhitehand(data.data.game.whitehand);
                        }

                        if (this.blackhand1 !== data.data.game.blackhand) {
                            this.blackhand1 = data.data.game.blackhand; 
                            this.board.setBlackhand(data.data.game.blackhand);
                        }

                        if (this.playing && this.userSide === this.sideToMove) { // Your turn!
                            if (fen) {
                                this.startTime = Date.now();
                            }
                        }
                    }
                    else {
                        const fen = this.board.getFEN(data.data.game.moves, 1);

                        if (this.whitehand2 !== data.data.game.whitehand) {
                            this.whitehand2 = data.data.game.whitehand; 
                        }

                        if (this.blackhand2 !== data.data.game.blackhand) {
                            this.blackhand2 = data.data.game.blackhand; 
                        }

                    }
        
                    if (data.data.game.results && data.data.game.status === 'finished') {
                        const results = data.data.game.results; 
                        if (this.playing) {
                            this.playing = false; 
                        }
                    }
                }
            }
        });
    }

    async sendMessage(message) {
        await this.page.evaluate(([message, clientId, gameId]) => {
            const cometSocket = window.websockets.find((ws) => ws.url.includes('cometd'));
            const data = [
                {
                    'channel': '/service/chat',
                    'data': {
                        'tid': 'Chat',
                        'id': 'G' + gameId,
                        'txt': message
                    },
                    'id': window.nextMessageId(),
                    'clientId': clientId
                }
            ]
            cometSocket.send(JSON.stringify(data));
        }, [message, this.clientId, this.gameId]);
    }

    async sendMove(uciMove) {
        this.sideToMove = !this.sideToMove; 
        const clockms = this.board.times[0][0] * 100 - (Date.now() - this.startTime); 
        await this.page.evaluate(([move, ply, clientId, gameId, username, clockms]) => {
            const cometSocket = window.websockets.find((ws) => ws.url.includes('cometd'));
            const data = [
                {
                    channel: '/service/game',
                    data: {
                        move: {
                            'gid': gameId,
                            'lastmovemessagesent': false, 
                            'coh': false, 
                            'mht': 100 + Math.floor(Math.random() * 1000),
                            'move': move,
                            'seq': ply,
                            'squared': true,
                            'uid': username,
                            'clock': Math.floor(clockms / 100),
                            'clockms': clockms
                        },
                        tid: 'Move',
                    },
                    id: window.nextMessageId(),
                    'clientId': clientId,
                },
            ];
            cometSocket.send(JSON.stringify(data));
        }, [encode(uciMove), this.ply, this.clientId, this.gameId, this.username, clockms]);
    }
    
    async seekGame(time, minRating, maxRating) {
        await this.page.evaluate(([time, clientId, username, minRating, maxRating]) => {
            const cometSocket = window.websockets.find((ws) => ws.url.includes('cometd'));
            const data = [
                {
                    'channel': '/service/game',
                    'data': {
                        'tid': 'Challenge',
                        'uuid': '',
                        'to': null,
                        'from': username,
                        'gametype': 'bughouse',
                        'initpos': null,
                        'rated': true,
                        'minrating': minRating,
                        'maxrating': maxRating,
                        'basetime': time,
                        'timeinc': 0
                    },
                    'id': window.nextMessageId(),
                    'clientId': clientId,
                },
            ];
            cometSocket.send(JSON.stringify(data));
        }, [time, this.clientId, this.username, minRating, maxRating]);
    } 

    async sendPartnershipRequest(target) { 
        await this.page.evaluate(([clientId, target, username]) => {
            const cometSocket = window.websockets.find((ws) => ws.url.includes('cometd'));
            const data = [
                {
                    'channel': '/service/game',
                    'data': {
                        'from': username,
                        'tid': 'RequestBughousePair',
                        'to': target
                    },
                    'id': window.nextMessageId(),
                    'clientId': clientId
                }
            ]
            cometSocket.send(JSON.stringify(data));
        }, [this.clientId, target, this.username]);
    }
}
