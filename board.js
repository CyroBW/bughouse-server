import { Chess } from "chess.js";
import tcn from "chess-tcn";

const SQUARE_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?";
const DROP_CHARACTERS = {
    "=": "p",
    "-": "n",
    "+": "b",
    "*": "r",
    "&": "q",
}
const TOWARD_A_FILE = -1;
const STRAIGHT = 0;
const TOWARD_H_FILE = 1;
const PROMOTION_CHARACTERS = {
    "~": { to: "q", direction: STRAIGHT },
    "}": { to: "q", direction: TOWARD_H_FILE },
    "{": { to: "q", direction: TOWARD_A_FILE },
    "^": { to: "n", direction: STRAIGHT },
    ")": { to: "n", direction: TOWARD_H_FILE },
    "(": { to: "n", direction: TOWARD_A_FILE },
    "#": { to: "b", direction: STRAIGHT },
    "$": { to: "b", direction: TOWARD_H_FILE },
    "@": { to: "b", direction: TOWARD_A_FILE },
    "_": { to: "r", direction: STRAIGHT },
    "]": { to: "r", direction: TOWARD_H_FILE },
    "[": { to: "r", direction: TOWARD_A_FILE },
};

function squareCharacterToAlgebraicSquare(squareCharacter) {
    const index = SQUARE_CHARACTERS.indexOf(squareCharacter);
    const file = "abcdefgh".charAt(index % 8);
    const rank = Math.floor(index / 8) + 1;
    return `${file}${rank}`;
}

export function encode(algebraicMove) {
    var move = null; 
    const from = algebraicMove.slice(0, 2);
    const to = algebraicMove.slice(2, 4);
    if (algebraicMove[1] == "@") {
        const to = algebraicMove.slice(2, 4);
        const piece = algebraicMove.charAt(0).toLowerCase();
        move = {"to": to, "drop": piece}; 
    }
    else  {
        move = {"to": to, "from": from}; 
        if (algebraicMove.length === 5 && algebraicMove[4] != "\n") 
            move["promotion"] = algebraicMove.charAt(4).toLowerCase();
    }

    return tcn.encode(move);
}

export function decode(move) {
    var decoded = tcn.decode(move); 
    if (!decoded) {
        return ""; 
    }
    if ("drop" in decoded) {
        return decoded.drop + "@" + decoded.to; 
    }
    else if ("promotion" in decoded) {
        return decoded.from + decoded.to + decoded.promotion; 
    }
    return decoded.from + decoded.to; 
}

function applyMove(board, move) {
    const [firstChar, secondChar] = move;
    const isDrop = firstChar in DROP_CHARACTERS;
    const isPromotion = secondChar in PROMOTION_CHARACTERS;
    if (isDrop) {
        board.put({ type: DROP_CHARACTERS[firstChar], color: board.turn() }, squareCharacterToAlgebraicSquare(secondChar));
        let [
        piecePlacement, sideToMove,
        castling, enPassantTarget, halfmoveClock, fullmoveNumber,] = board.fen().split(" ");
        sideToMove = sideToMove === "w" ? "b" : "w";
        enPassantTarget = "-";
        halfmoveClock = (parseInt(halfmoveClock) + 1).toString();
        if (sideToMove === "w") {
            fullmoveNumber = (parseInt(fullmoveNumber) + 1).toString();
        }
        const fenWithSideToMoveSwapped = [
            piecePlacement,
            sideToMove,
            castling,
            enPassantTarget,
            halfmoveClock,
            fullmoveNumber,
        ].join(" ");
        board.load(fenWithSideToMoveSwapped);
    }
    else if (isPromotion) {
        const from = squareCharacterToAlgebraicSquare(firstChar);
        const fromFile = from.charAt(0);
        const fromRank = from.charAt(1);
        const { to: promotion, direction } = PROMOTION_CHARACTERS[secondChar];
        const toFile = "abcdefgh"["abcdefgh".indexOf(fromFile) + direction];
        const toRank = fromRank === "7" ? "8" : "1";
        board.move({ from, to: `${toFile}${toRank}`, promotion });
    }
    else {
        const from = squareCharacterToAlgebraicSquare(firstChar);
        const to = squareCharacterToAlgebraicSquare(secondChar);
        board.move(`${from}${to}`, {sloppy: true});
    }
}

function chunkSubstr(str, size) {
    const numChunks = Math.ceil(str.length / size)
    const chunks = new Array(numChunks)
  
    for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
      chunks[i] = str.substr(o, size)
    }
  
    return chunks
}

const PAWN_OFFSETS = {
    b: [16, 32, 17, 15],
    w: [-16, -32, -17, -15],
}
  
const PIECE_OFFSETS = {
    n: [-18, -33, -31, -14, 18, 33, 31, 14],
    b: [-17, -15, 17, 15],
    r: [-16, 1, 16, -1],
    q: [-17, -16, -15, 1, 17, 16, 15, -1],
    k: [-17, -16, -15, 1, 17, 16, 15, -1],
}

function algebraic(square) {
    const f = square & 0xf
    const r = square >> 4
    return ("abcdefgh".substring(f, f + 1) +
        "87654321".substring(r, r + 1));
}
const startingFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export class Board {
    constructor() {
        this.board = [new Chess(), new Chess()];
        this.fen = [startingFen, startingFen]; 
        this.times = [[1800, 1800], [1800, 1800]];
        this.movesCnt = [0, 0];
        this.whitehand = ""; 
        this.blackhand = ""; 
    }
    
    getFEN(moves, board_num) {
        const movesArray = chunkSubstr(moves, 2);
        if (movesArray.length < this.movesCnt[board_num]) {
            this.board[board_num].load(startingFen);
            this.movesCnt[board_num] = 0;
        }
        for (let i = this.movesCnt[board_num]; i < movesArray.length; i++) {
            applyMove(this.board[board_num], movesArray[i]);
        }

        this.movesCnt[board_num] = movesArray.length;
        const fen = this.board[board_num].fen();
        if (this.fen[board_num] === fen) {
            return null;
        }
        this.fen[board_num] = fen;
        return fen;
    }

    setWhitehand(hand) {
        this.whitehand = hand; 
    }

    setBlackhand(hand) {
        this.blackhand = hand; 
    }

    isPredrop(move, userSide) { 
        if (move[1] === "@") {
            if (userSide) {
                if (this.whitehand.includes(move[0])) {
                    return false; 
                }
            }
            else if (this.blackhand.includes(move[0])) {
                return false; 
            }
            return true; 
        }
        return false; 
    }

    isLegal(move) { 
        if (move.length < 4) {
            return false; 
        }
        if (move[1] === "@") {
            if (this.board[0].turn() === "w") {
                if (!this.whitehand.includes(move[0])) {
                    return false; 
                }
            }
            else if (!this.blackhand.includes(move[0])) {
                return false; 
            }
            const to = move.substring(2, 4); 
            if (this.board[0].get(to) !== false) {
                return false; // Square must be empty 
            }

            // Check if in check after drop 
            this.board[0].put({ type: move[0], color: this.board[0].turn() }, to);
            const inCheck = this.board[0].inCheck();
            this.board[0].remove(to);
            return !inCheck; 
        }
        else {
            const from = move.substring(0, 2);
            const to = move.substring(2, 4); 
            const moves = this.board[0].moves({ square: from, verbose: true });
            for (const i in moves) {
                if (moves[i].to === to) {
                    return true; 
                }
            }
        }
        return false; 
    }

    getFenWithHand() {
        return this.fen[0].replace(" ", "[" + this.whitehand.toUpperCase() + this.blackhand.toLowerCase() + "] "); 
    }

    getScrambleMove() {
        const us = this.board[0].turn();
        const them = (this.board[0].turn() === "w") ? "b" : "w"; 
        const from = this.board[0]._kings[them];
        const hand = (this.board[0].turn() === "w") ? this.whitehand.toLowerCase() : this.blackhand.toLowerCase();
        const dropChecks = []; 

        let to; 
        for (const type of [...new Set(hand)]) {
            if (type === "p") {        
                for (let j = 2; j < 4; j++) {
                  to = from + PAWN_OFFSETS[them][j]
                  if (to & 0x88) continue
                  const toSquare = algebraic(to); 
                  if (!this.board[0].get(toSquare)) {
                      this.board[0].put({ type: type, color: this.board[0].turn() }, toSquare);
                      if (this.board[0]._isKingAttacked(them) && !this.board[0]._isKingAttacked(us)) {
                          dropChecks.push(type + "@" + toSquare); 
                      }
                      this.board[0].remove(toSquare);
                  }
                }
            } 
            else {
                for (let j = 0, len = PIECE_OFFSETS[type].length; j < len; j++) {
                    const offset = PIECE_OFFSETS[type][j]
                    to = from
                    while (true) {
                        to += offset
                        if (to & 0x88) break
                        const toSquare = algebraic(to); 
                        if (!this.board[0].get(toSquare)) {
                            this.board[0].put({ type: type, color: this.board[0].turn() }, toSquare);
                            if (this.board[0]._isKingAttacked(them) && !this.board[0]._isKingAttacked(us)) {
                                dropChecks.push(type + "@" + toSquare); 
                            }
                            this.board[0].remove(toSquare);
                        }
                        if (type === "n" || type === "k") break
                    }
                }
            }
        }

        if (dropChecks.length > 0) {
            return dropChecks[Math.floor(Math.random() * dropChecks.length)];
        }

        const moves = this.board[0].moves({ verbose: true });
        let res; 
        for (const move of moves) {
            if (move.san.includes("+")) {
                res = move.from + move.to;
                if (move.promotion !== undefined) {
                    res += move.promotion; 
                }
                return res; 
            }
        }

        for (const move of moves) {
            if (move.piece === "k") {
                return move.from + move.to;
            }
        }

        if (moves.length > 0) {
            const move = moves[Math.floor(Math.random() * moves.length)];
            return move.from + move.to;
        }
    }
}


