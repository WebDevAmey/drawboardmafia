export const WELCOME = `board 1
// Welcome to drawboardmafia. Everything here is a plain-text .board file.
// Press Cmd+/ (Ctrl+/) to see and edit this board as text.
intro: frame "Start here" @-40,-60 1000x560 { hello draw keys code }
hello: note "Hi! This board is plain text.\\n\\nDrag things around, then open the\\ntext pane (Cmd+/) and watch the\\nlines change." @0,0 300x200
draw: box "Draw with R O D A P T N" @380,20 260x80 fill=blue
keys: ellipse "Space-drag to pan\\nCmd+scroll to zoom" @700,10 220x110 fill=violet
code: code "dbm render board.board -o out.svg\\ndbm merge %O %A %B\\ndbm fmt --check docs/*.board" @380,300 420x110 lang=sh
merge: cylinder "git" @700,300 120x110 fill=green stroke=green
hello -> draw "sketch"
draw -> keys route=curve
code -> merge "merge driver" dash=dashed
`;
