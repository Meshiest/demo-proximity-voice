# Simple Peer Voice Chat

This is a demo for a group voice chat using peerjs to handle WebRTC and socket.io to help clients connect.

You need to generate a self-signed certificate to run this as voice media can only be used over secure connections:

    openssl genrsa -out key.pem
    openssl req -new -key key.pem -out csr.pem
    openssl x509 -req -days 9999 -in csr.pem -signkey key.pem -out cert.pem
    rm csr.pem

Install dependencies with `npm install` and run with `npm start`
