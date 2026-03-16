import React, { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

const VideoCall = ({ chatId, userId, sendSignal, signalQueue, popSignal, onClose, isCaller }) => {
    // ... (state vars same) ...
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // { [peerId]: stream }
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);

    // Map: peerId -> RTCPeerConnection
    const peersRef = useRef({});
    const localVideoRef = useRef(null);
    const iceCandidatesQueue = useRef({});

    // Initialize Local Stream (Same logic)
    useEffect(() => {
        // ... (getUserMedia logic same) ...
        const startLocalStream = async () => {
            // ...
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                setLocalStream(stream);
                if (localVideoRef.current) localVideoRef.current.srcObject = stream;
                sendSignal('JOIN_CALL', { chatId });
            } catch (err) {
                console.error(err);
                onClose();
            }
        };
        startLocalStream();
        // ...
        return () => {
            Object.values(peersRef.current).forEach(peer => peer.close());
            if (localStream) localStream.getTracks().forEach(track => track.stop());
        };
    }, []);

    // createPeer function (Same logic)
    const createPeer = (targetUserId, stream) => {
        // ... (Same implementation)
        const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peer.onicecandidate = (event) => {
            if (event.candidate) sendSignal('ICE_CANDIDATE', { targetId: targetUserId, candidate: event.candidate, chatId });
        };
        peer.ontrack = (event) => {
            setRemoteStreams(prev => ({ ...prev, [targetUserId]: event.streams[0] }));
        };
        if (stream) stream.getTracks().forEach(track => peer.addTrack(track, stream));
        peersRef.current[targetUserId] = peer;
        return peer;
    };

    // Handle Signaling (QUEUE BASED)
    useEffect(() => {
        if (signalQueue.length === 0) return;

        const currentSignal = signalQueue[0];
        const { type, payload } = currentSignal;

        // Always pop signal after checking, or if we decide to process it
        // To avoid infinite loop if we don't pop, we must be careful.
        // We pop AFTER processing logic is done or determined irrelevant.

        // Ignore signals not meant for this chat
        if (payload.chatId && payload.chatId !== chatId) {
            popSignal();
            return;
        }

        // Ignore own signals
        if (payload.senderId === userId) {
            popSignal();
            return;
        }

        const handleSignal = async () => {
            try {
                const senderId = payload.senderId;

                // 1. New User Joined -> We (existing user) send OFFER
                if (type === 'JOIN_CALL') {
                    if (peersRef.current[senderId]) return;
                    const peer = createPeer(senderId, localStream);
                    const offer = await peer.createOffer();
                    await peer.setLocalDescription(offer);
                    sendSignal('VIDEO_OFFER', { targetId: senderId, offer, chatId });
                }

                // 2. Received Offer -> We answer
                else if (type === 'VIDEO_OFFER') {
                    if (payload.targetId && payload.targetId !== userId) return;

                    let peer = peersRef.current[senderId];
                    if (!peer) {
                        peer = createPeer(senderId, localStream);
                    }
                    if (peer.signalingState !== "stable" && peer.signalingState !== "have-local-offer") {
                        // glare
                    }
                    await peer.setRemoteDescription(new RTCSessionDescription(payload.offer));

                    if (iceCandidatesQueue.current[senderId]) {
                        for (const candidate of iceCandidatesQueue.current[senderId]) {
                            await peer.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                        delete iceCandidatesQueue.current[senderId];
                    }

                    const answer = await peer.createAnswer();
                    await peer.setLocalDescription(answer);
                    sendSignal('VIDEO_ANSWER', { targetId: senderId, answer, chatId });
                }

                // 3. Received Answer -> Set Remote Desc
                else if (type === 'VIDEO_ANSWER') {
                    if (payload.targetId && payload.targetId !== userId) return;
                    const peer = peersRef.current[senderId];
                    if (peer) {
                        await peer.setRemoteDescription(new RTCSessionDescription(payload.answer));
                        if (iceCandidatesQueue.current[senderId]) {
                            for (const candidate of iceCandidatesQueue.current[senderId]) {
                                await peer.addIceCandidate(new RTCIceCandidate(candidate));
                            }
                            delete iceCandidatesQueue.current[senderId];
                        }
                    }
                }

                // 4. ICE Candidate
                else if (type === 'ICE_CANDIDATE') {
                    if (payload.targetId && payload.targetId !== userId) return;
                    const peer = peersRef.current[senderId];
                    if (peer) {
                        if (peer.remoteDescription) {
                            await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
                        } else {
                            if (!iceCandidatesQueue.current[senderId]) iceCandidatesQueue.current[senderId] = [];
                            iceCandidatesQueue.current[senderId].push(payload.candidate);
                        }
                    } else {
                        if (!iceCandidatesQueue.current[senderId]) iceCandidatesQueue.current[senderId] = [];
                        iceCandidatesQueue.current[senderId].push(payload.candidate);
                    }
                }

                // 5. Call Ended
                else if (type === 'VIDEO_CALL_ENDED') {
                    onClose();
                }

            } catch (e) {
                console.error("Signaling Error:", e);
            } finally {
                // Ensure we pop the signal so loop continues
                popSignal();
            }
        };

        handleSignal();
    }, [signalQueue, userId, chatId, sendSignal, localStream, popSignal]);

    // Toggles
    const toggleMute = () => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
            setIsVideoOff(!isVideoOff);
        }
    };

    // Host ends call
    const handleEndCall = () => {
        // Broadcast end call to everyone
        sendSignal('VIDEO_CALL_ENDED', { chatId });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 flex flex-col p-6 animate-in fade-in duration-300">
            {/* Grid Layout */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr p-4">
                {/* My Video */}
                <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-700 group">
                    <VideoPlayer stream={localStream} />
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-xs font-medium border border-white/10">
                        You
                    </div>
                </div>

                {/* Remote Videos */}
                {Object.entries(remoteStreams).map(([peerId, stream]) => (
                    <div key={peerId} className="relative bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-700">
                        <VideoPlayer stream={stream} />
                        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-xs font-medium border border-white/10">
                            User {peerId.substring(0, 4)}...
                        </div>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="h-24 flex items-center justify-center gap-6 pb-6">
                <button
                    onClick={toggleMute}
                    className={`p-5 rounded-full ${isMuted ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'} transition-all duration-200 active:scale-95 ring-1 ring-white/10`}
                >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>
                <button
                    onClick={toggleVideo}
                    className={`p-5 rounded-full ${isVideoOff ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'} transition-all duration-200 active:scale-95 ring-1 ring-white/10`}
                >
                    {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                </button>
                <button
                    onClick={handleEndCall}
                    className="p-5 rounded-full bg-rose-600 hover:bg-rose-700 text-white transition-all duration-200 shadow-xl shadow-rose-900/50 active:scale-95 ring-1 ring-rose-400/50"
                >
                    <PhoneOff size={24} />
                </button>
            </div>
        </div>
    );
};

// Helper component to handle ref for media stream
const VideoPlayer = ({ stream }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
        />
    );
};

export default VideoCall;
