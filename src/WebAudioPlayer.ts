import store from "../../store";
import { WebAudioScheduler } from "../../utils/WebAudioScheduler";

let vol = 100;
export const eventKeys = {
	timeUpdate: 'audioTimeUpdate',
	audioEnded: 'audioEnded',
}

const events = {
	timeUpdate: new Event(eventKeys.timeUpdate),
	audioEnded: new Event(eventKeys.audioEnded),
}

type Event = {}

export class WebAudioPlayer {

	audioContext: AudioContext;
	source: AudioBufferSourceNode;
	gainNode: GainNode;
	scheduler: WebAudioScheduler;

	playing: boolean = false;
	stopped: boolean = true;

	currentlyPlaying;

	events: Event[] = [];
	buffers = {};

	startedAt: number = 0;
	pausedAt: number = 0;
	duration: number = 0;
	_currentTime: number = 0;
	timeupdateInt: number = 0;


	constructor (opts) {
		this.audioContext = opts.audioContext;
		this.gainNode = this.audioContext.createGain();
		this.gainNode.connect(this.audioContext.destination);

		// TODO: Move scheduling into WebAudioScheduler
		this.scheduler = new WebAudioScheduler();
	}

	get src () {
		return this.currentlyPlaying;
	}

	set src (file) {
		this.play(file);
		this.currentlyPlaying = file;
	}

	removeEventListener (event) {
		delete this.events[event];
	}

	addEventListener (event, cb) {
		this.events.push({ [event]: cb });
	}

	loadFile (url, done) {
		const request = new XMLHttpRequest();
		const { token } = store.getState().auth;
		request.open('GET', url, true);
		if (token) {
			request.setRequestHeader('Authorization', `Bearer ${token}`);
		}

		request.responseType = 'arraybuffer';

		// Decode asynchronously
		request.onload = () => this.audioContext.decodeAudioData(request.response, done);
		request.send();
	}

	_dispatchUpdate (event) {
		window.dispatchEvent(event);
	}

	play (file, time = 0) {
		this.stop();
		this.currentlyPlaying = file;

		if (this.buffers[file] == null) {
			this.loadFile(file, (buffer) => {
				this.buffers[file] = buffer;
				this._playBuffer(buffer, time || this.pausedAt);
			});
		} else {
			this._playBuffer(this.buffers[file], time || this.pausedAt);
		}
	}

	_playBuffer (buffer, offset) {
		if (this.timeupdateInt) {
			window.clearInterval(this.timeupdateInt);
			this.timeupdateInt = null;
		}
		if (this.playing) {
			this.stop();
		}

		this._currentTime = offset || 0;
		this.source = this.audioContext.createBufferSource();
		this.source.buffer = buffer;
		this.duration = buffer.duration;
		this.source.connect(this.audioContext.destination);
		this.source.connect(this.gainNode);
		this.volume = vol;
		this.source.start(0, offset);
		this._dispatchUpdate(events.timeUpdate);
		this.playing = true;
		this.stopped = false;

		this.startedAt = this.audioContext.currentTime - offset;
		this.pausedAt = 0;

		this.timeupdateInt = window.setInterval(() => {
			this._currentTime += 1 / 2;
			this._dispatchUpdate(events.timeUpdate);

			if (this.playing === false) {
				window.clearInterval(this.timeupdateInt);
			}
		}, 500);

		this.source.onended = () => {
			if (
				this.currentTime === this.duration ||
				this.currentTime + 1 === this.duration ||
				this.currentTime >= this.duration
			) {
				this.stop();
				this._dispatchUpdate(events.audioEnded);
			}
		};
	}

	pause () {
		this.pausedAt = this.audioContext.currentTime - this.startedAt;
		this.stop();
	}

	stop () {
		this.stopped = true;

		if (this.timeupdateInt) {
			window.clearInterval(this.timeupdateInt);
		}

		if (this.source) {
			this.source.disconnect();
			this.source.stop(0);
			this.source = null;
		}

		this.pausedAt = 0;
		this.startedAt = 0;
		this.playing = false;
	}

	set volume (amount) {
		vol = amount;
		const max = Math.min(this.gainNode.gain.maxValue, 0);
		const min = -1;
		let val = ((amount * (max - min) / 100) + min);

		if (val === min) {
			val = -1.0000000000000000001;
		}

		this.gainNode.gain.value = val;
	}

	get volume () {
		return this.gainNode.gain.value;
	}

	get currentTime () {
		return this._currentTime;
	}

	set currentTime (seconds) {
		if (typeof seconds != 'number') throw new Error('currentTime only accepts a number');
		if (this.currentlyPlaying == null || this.playing == false) throw new Error('Cannot set time of track that isn\'t playing');
		this._currentTime = seconds;
		this.play(this.currentlyPlaying, seconds);
	}
}