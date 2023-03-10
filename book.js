import fs from "fs";

export class Book {
    constructor() {
        this.book = JSON.parse(fs.readFileSync("book.txt").toString().trim());
    }

    put(fen, move) {
        if (!(fen in this.book)) {
            this.book[fen] = {};
        }

        if (move in this.book[fen]) {
            this.book[fen][move] += 1; 
        }
        else {
            this.book[fen][move] = 1; 
        }
        this.save();
    }

    get(fen) {
        if (!(fen in this.book)) {
            return null; 
        }

        let moves = this.book[fen];
        return Object.entries(moves).reduce((a, b) => a[1] > b[1] ? a : b)[0]
    }

    save() {
        fs.writeFileSync("book.txt", JSON.stringify(this.book)); 
    }
}