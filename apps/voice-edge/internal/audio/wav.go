package audio

import (
	"bytes"
	"encoding/binary"
	"errors"
)

func PCM16ToLittleEndian(samples []int16) []byte {
	out := make([]byte, len(samples)*2)
	for i, sample := range samples {
		binary.LittleEndian.PutUint16(out[i*2:i*2+2], uint16(sample))
	}
	return out
}

func LittleEndianToPCM16(data []byte) []int16 {
	if len(data)%2 == 1 {
		data = data[:len(data)-1]
	}
	out := make([]int16, len(data)/2)
	for i := range out {
		out[i] = int16(binary.LittleEndian.Uint16(data[i*2 : i*2+2]))
	}
	return out
}

func EncodeWAVPCM16(samples []int16, sampleRate int) []byte {
	pcm := PCM16ToLittleEndian(samples)
	dataLen := uint32(len(pcm))
	var buffer bytes.Buffer
	buffer.WriteString("RIFF")
	writeU32(&buffer, 36+dataLen)
	buffer.WriteString("WAVE")
	buffer.WriteString("fmt ")
	writeU32(&buffer, 16)
	writeU16(&buffer, 1)
	writeU16(&buffer, 1)
	writeU32(&buffer, uint32(sampleRate))
	writeU32(&buffer, uint32(sampleRate*2))
	writeU16(&buffer, 2)
	writeU16(&buffer, 16)
	buffer.WriteString("data")
	writeU32(&buffer, dataLen)
	buffer.Write(pcm)
	return buffer.Bytes()
}

func DecodeWAVPCM16(data []byte) ([]int16, int, error) {
	if len(data) < 44 || string(data[0:4]) != "RIFF" || string(data[8:12]) != "WAVE" {
		return LittleEndianToPCM16(data), 24000, nil
	}
	offset := 12
	sampleRate := 0
	for offset+8 <= len(data) {
		chunkID := string(data[offset : offset+4])
		chunkSize := int(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		chunkStart := offset + 8
		chunkEnd := chunkStart + chunkSize
		if chunkEnd > len(data) {
			return nil, 0, errors.New("truncated wav chunk")
		}
		switch chunkID {
		case "fmt ":
			if chunkSize < 16 {
				return nil, 0, errors.New("invalid wav fmt chunk")
			}
			audioFormat := binary.LittleEndian.Uint16(data[chunkStart : chunkStart+2])
			channels := binary.LittleEndian.Uint16(data[chunkStart+2 : chunkStart+4])
			bitsPerSample := binary.LittleEndian.Uint16(data[chunkStart+14 : chunkStart+16])
			if audioFormat != 1 || channels != 1 || bitsPerSample != 16 {
				return nil, 0, errors.New("only mono pcm16 wav is supported")
			}
			sampleRate = int(binary.LittleEndian.Uint32(data[chunkStart+4 : chunkStart+8]))
		case "data":
			if sampleRate == 0 {
				sampleRate = 24000
			}
			return LittleEndianToPCM16(data[chunkStart:chunkEnd]), sampleRate, nil
		}
		offset = chunkEnd
		if offset%2 == 1 {
			offset++
		}
	}
	return nil, 0, errors.New("wav data chunk not found")
}

func writeU16(buffer *bytes.Buffer, value uint16) {
	_ = binary.Write(buffer, binary.LittleEndian, value)
}

func writeU32(buffer *bytes.Buffer, value uint32) {
	_ = binary.Write(buffer, binary.LittleEndian, value)
}
