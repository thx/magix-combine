let MOVE_LEFT = '\x1b[1000D';
let MOVE_UP = '\x1b[1A';
let CLEAR_LINE = '\x1b[0K';
let HIDE_CURSOR = '\x1b[?25l';
let SHOW_CURSOR = '\x1b[?25h';
let stringWidth = require('string-width');
let getLogger = (stream) => {
    let str = '';
    let prevLineCount = 0;
    let last = '';
    let logger = {
        log() {
            this.clear();
            let nextStr = [].join.call(arguments, ' ');
            str = HIDE_CURSOR;
            str += nextStr;
            stream.write(str);
            // How many lines to remove on next clear screen
            let prevLines = nextStr.split('\n');
            prevLineCount = 0;
            for (let i = 0; i < prevLines.length; i++) {
                prevLineCount += Math.ceil(stringWidth(prevLines[i]) / stream.columns) || 1;
            }
            last = str;
            str = '';
        },
        ever() {
            this.clear();
            let nextStr = [].join.call(arguments, ' ');
            stream.write(nextStr + '\n');
            if (last) {
                this.log(last);
            }
        },
        clear(clearLast) {
            if (clearLast) {
                last = '';
            }
            str = SHOW_CURSOR;
            // Clear screen
            for (var i = 0; i < prevLineCount; i++) {
                str += MOVE_LEFT + CLEAR_LINE + (i < prevLineCount - 1 ? MOVE_UP : '');
            }
            prevLineCount = 0;
            stream.write(str);
            str = '';
        }
    };
    process.on('SIGINT', () => {
        logger.clear();
        process.exit(0);
    });
    return logger;
};
module.exports = getLogger(process.stdout);