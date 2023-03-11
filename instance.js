//'use strict';
import { Board, encode, decode } from './board.js';
import { Book } from './book.js';

export class Instance {
    constructor(ws, context, username, password) {
        this.ws = ws; 
        this.context = context;
        this.username = username; 
        this.password = password;
        this.book = new Book(); 
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
        this.premoves = []; 
        this.predrops = []; 
        this.following = [];    
        this.playing = false; 
        this.useBook = false;
        this.scramble = false; 
        this.setSocketCallback(); 
    }

    setSocketCallback() {
        this.ws.on('message', async (data) => {
            const dataString = data.toString();  
	        console.log(`Client: ${dataString}`);
            const args = dataString.split(' ');

            if (dataString === 'ping') {
                this.ws.send('message pong');
            }
            else if (dataString.startsWith('book on')) {
                this.useBook = true;
                if (this.playing && this.userSide === this.sideToMove) {
                    const move = this.book.get(this.board.getFenWithHand()); 
                    if (move) {
                        this.sendMove(move); 
                    }
                }
            } 
            else if (dataString.startsWith('book off')) {
                this.useBook = false;
            } 
            else if (dataString.startsWith('scramble on')) {
                this.scramble = true;
                if (this.playing && this.userSide === this.sideToMove) {
                    const move = this.board.getScrambleMove();
                    if (move) {
                        this.sendMove(move); 
                    }
                }
            } 
            else if (dataString.startsWith('scramble off')) {
                this.scramble = false;
            } 
            else if (dataString.startsWith('resign')) {
                this.resign(); 
            } 
            else if (dataString.startsWith('partner')) {
                if (args[1]) {
                    this.partner = args[1]; 
                    this.sendPartnershipRequest(this.partner);
                } 
            } 
            else if (dataString.startsWith('unpartner')) {
                if (this.partner) {
                    this.cancelPartnership(this.partner); 
                } 
                else if (args[1]) {
                    this.cancelPartnership(args[1]); 
                }
            } 
            else if (dataString.startsWith('seek')) {
		        var tc = Number(args[1]); 
                var minRating = Number(args[2]); 
                var maxRating = Number(args[3]); 
                if (Number.isNaN(tc) || tc !== 2) {
                    tc = 3; 
                }
                if (Number.isNaN(minRating)) {
                    minRating = null; 
                }
                if (Number.isNaN(maxRating)) {
                    maxRating = null; 
                }
                const lowerBound = (minRating === null || minRating === 0) ? '-∞' : minRating;
                const upperBound = maxRating === null ? '∞' : maxRating;  

                this.ws.send('message Seeking ' + tc + ' minute game ' + '(' + lowerBound + ' / ' + upperBound + ')'); 
                this.seekGame(tc * 600, minRating, maxRating); 
            }
            else if (dataString.startsWith('message')) {
                this.sendMessage(dataString.slice(dataString.indexOf(' ') + 1));
            }
            else if (dataString.startsWith('move')) {
                const move = args[1];
                if (this.playing && this.userSide === this.sideToMove && this.board.isLegal(move)) {
                    this.sendMove(move); 
                }
            }
            else if (dataString.startsWith('premove')) {
                let premove = args[1]; 
                let predrop = (args[2] === 'true'); 
                this.premoves.push(premove); 
                this.predrops.push(predrop);
                
                if (this.playing && this.userSide === this.sideToMove) {
                    this.triggerPremoves(); 
                }
            }
            else if (dataString === 'cancel') {
                this.premoves.length = 0; 
                this.predrops.length = 0; 
            }
        });

        this.ws.on('close', async (event) => {
            console.log(this.ws._socket.remoteAddress + ' disconnected!');
            this.context.close(); 
        });
    }

    async triggerPremoves() {
        let premove = this.premoves[0]; 
        let predrop = this.predrops[0]; 
        if (predrop) {
            for (let i = 0; i < this.premoves.length; i++) {
                if (this.predrops[i] && this.board.isLegal(this.premoves[i])) {
                    this.sendMove(this.premoves[i]);
                    for (let j = 0; j <= i; j++) {
                        this.premoves.shift(); 
                        this.predrops.shift(); 
                    }
                    break;
                }
            }
        }
        else {
            while (this.premoves.length > 0) {
                premove = this.premoves.shift();
                predrop = this.predrops.shift(); 
                if (this.board.isLegal(premove)) {
                    this.sendMove(premove);
                    break;
                }
                else if (predrop) {
                    this.premoves.unshift(premove); 
                    this.predrops.unshift(predrop); 
                    break; 
                }
            }
        }
    }

    async start() {
        this.page = await this.context.newPage();
        await this.page.goto('https://www.chess.com/login_and_go?returnUrl=https://www.chess.com/');
    
        await this.page.type('input[id="username"]', this.username); 
        await this.page.type('input[id="password"]', this.password); 
        await this.page.click('button[id="login"]'),

        await this.page.addInitScript({ path: './hook.js' });
        await this.page.goto('https://www.chess.com/play/online');
        this.ws.send('connected');

        const client = await this.page.context().newCDPSession(this.page);
        await client.send('Network.enable');
        await client.send('Page.enable');   

        client.on('Network.webSocketFrameReceived', async (message) => {
            if (message.response.payloadData[0] === '[') {
                const data = JSON.parse(message.response.payloadData)[0];

                if ('clientId' in data) {
                    this.clientId = data.clientId;
                }

                if (data.data && data.data.tid === 'RequestBughousePair' && data.data.from && data.data.to) {
                    this.ws.send('message ' + data.data.from.uid + ' has sent a partnership request to ' + data.data.to.uid + '!'); 
                }

                if (data.data && data.data.tid === 'BughousePairCancel' && data.data.from && data.data.to) {
                    this.ws.send('message ' + data.data.from.uid + ' has cancelled partnership with ' + data.data.to.uid); 
                }

                if (data.data && data.data.tid === 'BughousePair' && data.data.from && data.data.to) {
                    this.ws.send('message ' + data.data.from.uid + ' is now partnered with ' + data.data.to.uid + '!'); 
                }

                if (data.data && data.data.tid === 'FollowedUserList' && data.data.users) {
                    for(const user of data.data.users) {
                        this.unfollow(user.uid); 
                    }
                }
        
                if (data.data && data.data.message && data.data.message.txt) {
                    if (!data.data.message.id.includes(this.gameId)) {
                        if (data.data.message.from) {
                            this.ws.send('message ' + data.data.message.from.uid + ': ' + data.data.message.txt); 
                        }
                        else {
                            this.ws.send('message ' + data.data.message.txt); 
                        }
                    }
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
                            this.ws.send('userside white');  
                            this.opponent = players[1].uid; 
                        }
                        else {
                            this.ws.send('userside black');  
                            this.opponent = players[0].uid; 
                        }
                        if (data.data.game.status === 'starting' && data.data.tid === 'FullGame') {
                            this.ws.send('started'); 
                            this.playing = true; 
                        }
                        const fen = this.board.getFEN(data.data.game.moves, 0);
                        if (fen) { // New position
                            this.ws.send('move1 ' + decode(data.data.game.moves.slice(-2)));
                            this.ws.send('fen1 ' + fen);
                            this.playing = true; 
                        }
                        
                        if (this.whitehand1 !== data.data.game.whitehand) {
                            this.whitehand1 = data.data.game.whitehand; 
                            this.ws.send('whitehand1 ' + data.data.game.whitehand);
                            this.board.setWhitehand(data.data.game.whitehand);
                        }

                        if (this.blackhand1 !== data.data.game.blackhand) {
                            this.blackhand1 = data.data.game.blackhand; 
                            this.ws.send('blackhand1 ' + data.data.game.blackhand);
                            this.board.setBlackhand(data.data.game.blackhand);
                        }
                        this.ws.send('times1 ' + data.data.game.clocks);

                        if (this.playing && this.userSide === this.sideToMove) {
                            if (fen) {
                                this.startTime = Date.now();
                            }
                            this.triggerPremoves(); 
                            if (this.useBook && this.userSide === this.sideToMove && this.ply < 20) {
                                const move = this.book.get(this.board.getFenWithHand()); 
                                if (move) {
                                    this.sendMove(move); 
                                }
                            }
                            if (this.userSide === this.sideToMove && this.scramble) {
                                const move = this.board.getScrambleMove();
                                if (move) {
                                    this.sendMove(move); 
                                }
                            }
                        }

                        if (players[0].uid && players[0].bughouse && players[1].uid && players[1].bughouse) {
                            this.ws.send('players1 ' + players[0].uid + ',' + players[1].uid);
                            this.ws.send('ratings1 ' + '(' + players[0].bughouse + '),(' + players[1].bughouse + ')');
                        }
                    }
                    else {
                        const fen = this.board.getFEN(data.data.game.moves, 1);
                        if (fen) {
                            this.ws.send('move2 ' + decode(data.data.game.moves.slice(-2)));
                            this.ws.send('fen2 ' + fen);
                        }

                        if (this.whitehand2 !== data.data.game.whitehand) {
                            this.whitehand2 = data.data.game.whitehand; 
                            this.ws.send('whitehand2 ' + data.data.game.whitehand);
                        }

                        if (this.blackhand2 !== data.data.game.blackhand) {
                            this.blackhand2 = data.data.game.blackhand; 
                            this.ws.send('blackhand2 ' + data.data.game.blackhand);
                        }

                        this.ws.send('times2 ' + data.data.game.clocks);
        
                        if (players[0].uid && players[0].bughouse && players[1].uid && players[1].bughouse) {
                            this.ws.send('players2 ' + players[0].uid + ',' + players[1].uid);
                            this.ws.send('ratings2 ' + '(' + players[0].bughouse + '),(' + players[1].bughouse + ')');
                        }
                    }
        
                    if (data.data.game.results && data.data.game.status === 'finished') {
                        const results = data.data.game.results; 
                        this.ws.send('message ' + players[0].uid + ': ' + results[0] + ', ' + players[1].uid + ': ' + results[1]);
                        if (indexOfUser !== -1 && data.data.ratings && data.data.ratingchanges && data.data.ratings.length > 0 && data.data.ratingchanges.length > 0) {
                            if (data.data.ratingchanges[indexOfUser] >= 0) {
                                this.ws.send('message Your new rating is ' + data.data.ratings[indexOfUser] + ' (+' + data.data.ratingchanges[indexOfUser] + ')');    
                            }
                            else {
                                this.ws.send('message Your new rating is ' + data.data.ratings[indexOfUser] + ' (' + data.data.ratingchanges[indexOfUser] + ')');    
                            }
                        }
                        if (this.playing) {
                            this.playing = false; 
                            this.ws.send('finished');  
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
        if (this.ply < 20) {
            this.book.put(this.board.getFenWithHand(), uciMove); 
        }
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
    
    async resign() {
        await this.page.evaluate(([clientId, gameId]) => {
            const cometSocket = window.websockets.find((ws) => ws.url.includes('cometd'));
            const data = [
                {
                    'channel': '/service/game',
                    'data': {
                        'tid': 'Resign',
                        'gid': gameId,
                    },
                    'id': window.nextMessageId(),
                    'clientId': clientId
                }
            ]
            cometSocket.send(JSON.stringify(data));
        }, [this.clientId, this.gameId]);
    }

    async unfollow(target) {
        await this.page.evaluate(([clientId, target, username]) => {
            const cometSocket = window.websockets.find((ws) => ws.url.includes('cometd'));
            const data = [
                {
                    'channel': '/service/user',
                    'data': {
                        'from': username,
                        'tid': 'Unfollow',
                        'to': target
                    },
                    'id': window.nextMessageId(),
                    'clientId': clientId
                }
            ]
            cometSocket.send(JSON.stringify(data));
        }, [this.clientId, target, this.username]);
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

    async cancelPartnership(target) { 
        await this.page.evaluate(([clientId, target, username]) => {
            const cometSocket = window.websockets.find((ws) => ws.url.includes('cometd'));
            const data = [
                {
                    'channel': '/service/game',
                    'data': {
                        'from': username,
                        'tid': 'BughousePairCancel',
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
