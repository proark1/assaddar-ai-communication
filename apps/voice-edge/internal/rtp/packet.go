package rtp

import (
	"encoding/binary"
	"errors"
)

const headerLength = 12

type Packet struct {
	Marker         bool
	PayloadType    uint8
	SequenceNumber uint16
	Timestamp      uint32
	SSRC           uint32
	Payload        []byte
}

func ParsePacket(data []byte) (Packet, error) {
	if len(data) < headerLength {
		return Packet{}, errors.New("rtp packet shorter than fixed header")
	}
	version := data[0] >> 6
	if version != 2 {
		return Packet{}, errors.New("unsupported rtp version")
	}
	hasPadding := data[0]&0x20 != 0
	hasExtension := data[0]&0x10 != 0
	csrcCount := int(data[0] & 0x0f)
	offset := headerLength + csrcCount*4
	if len(data) < offset {
		return Packet{}, errors.New("rtp packet truncated before csrc list")
	}
	if hasExtension {
		if len(data) < offset+4 {
			return Packet{}, errors.New("rtp packet truncated before extension header")
		}
		extensionLength := int(binary.BigEndian.Uint16(data[offset+2:offset+4])) * 4
		offset += 4 + extensionLength
		if len(data) < offset {
			return Packet{}, errors.New("rtp packet truncated before extension payload")
		}
	}
	payloadEnd := len(data)
	if hasPadding {
		padding := int(data[len(data)-1])
		if padding == 0 || padding > len(data)-offset {
			return Packet{}, errors.New("invalid rtp padding")
		}
		payloadEnd -= padding
	}
	return Packet{
		Marker:         data[1]&0x80 != 0,
		PayloadType:    data[1] & 0x7f,
		SequenceNumber: binary.BigEndian.Uint16(data[2:4]),
		Timestamp:      binary.BigEndian.Uint32(data[4:8]),
		SSRC:           binary.BigEndian.Uint32(data[8:12]),
		Payload:        append([]byte(nil), data[offset:payloadEnd]...),
	}, nil
}

func (packet Packet) Marshal() ([]byte, error) {
	if packet.PayloadType > 127 {
		return nil, errors.New("rtp payload type must fit in 7 bits")
	}
	out := make([]byte, headerLength+len(packet.Payload))
	out[0] = 0x80
	out[1] = packet.PayloadType
	if packet.Marker {
		out[1] |= 0x80
	}
	binary.BigEndian.PutUint16(out[2:4], packet.SequenceNumber)
	binary.BigEndian.PutUint32(out[4:8], packet.Timestamp)
	binary.BigEndian.PutUint32(out[8:12], packet.SSRC)
	copy(out[headerLength:], packet.Payload)
	return out, nil
}
