package audio

import (
	"errors"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/g711"
	"github.com/assaddar/ai-communication/apps/voice-edge/internal/sdp"
)

func DecodeTelephonyPayload(codec sdp.Codec, payload []byte) ([]int16, error) {
	switch codec.PayloadType {
	case sdp.CodecPCMA.PayloadType:
		return g711.DecodeALawFrame(payload), nil
	case sdp.CodecPCMU.PayloadType:
		return g711.DecodeULawFrame(payload), nil
	default:
		return nil, errors.New("unsupported telephony codec")
	}
}

func EncodeTelephonyPayload(codec sdp.Codec, samples []int16) ([]byte, error) {
	switch codec.PayloadType {
	case sdp.CodecPCMA.PayloadType:
		return g711.EncodeALawFrame(samples), nil
	case sdp.CodecPCMU.PayloadType:
		return g711.EncodeULawFrame(samples), nil
	default:
		return nil, errors.New("unsupported telephony codec")
	}
}

func FramePCM(samples []int16, frameSize int) [][]int16 {
	if frameSize <= 0 {
		return nil
	}
	frames := make([][]int16, 0, (len(samples)+frameSize-1)/frameSize)
	for len(samples) > 0 {
		n := frameSize
		if len(samples) < n {
			n = len(samples)
		}
		frame := make([]int16, frameSize)
		copy(frame, samples[:n])
		frames = append(frames, frame)
		samples = samples[n:]
	}
	return frames
}
