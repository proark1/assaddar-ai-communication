package sdp

import (
	"fmt"
	"strconv"
	"strings"
)

type Offer struct {
	ConnectionIP string
	MediaPort   int
	Payloads    []int
	RTPMap      map[int]string
}

type Codec struct {
	Name        string
	PayloadType int
	ClockRate   int
}

var (
	CodecPCMA = Codec{Name: "PCMA", PayloadType: 8, ClockRate: 8000}
	CodecPCMU = Codec{Name: "PCMU", PayloadType: 0, ClockRate: 8000}
)

func ParseOffer(body string) (Offer, error) {
	offer := Offer{RTPMap: map[int]string{}}
	for _, rawLine := range strings.Split(strings.ReplaceAll(body, "\r\n", "\n"), "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "c=IN IP4 ") {
			offer.ConnectionIP = strings.TrimSpace(strings.TrimPrefix(line, "c=IN IP4 "))
			continue
		}
		if strings.HasPrefix(line, "m=audio ") {
			fields := strings.Fields(line)
			if len(fields) < 4 {
				return Offer{}, fmt.Errorf("invalid audio media line: %s", line)
			}
			port, err := strconv.Atoi(fields[1])
			if err != nil {
				return Offer{}, fmt.Errorf("invalid audio port: %w", err)
			}
			offer.MediaPort = port
			for _, payload := range fields[3:] {
				value, err := strconv.Atoi(payload)
				if err != nil {
					return Offer{}, fmt.Errorf("invalid payload type %q: %w", payload, err)
				}
				offer.Payloads = append(offer.Payloads, value)
			}
			continue
		}
		if strings.HasPrefix(line, "a=rtpmap:") {
			rest := strings.TrimPrefix(line, "a=rtpmap:")
			parts := strings.SplitN(rest, " ", 2)
			if len(parts) != 2 {
				continue
			}
			payload, err := strconv.Atoi(parts[0])
			if err != nil {
				continue
			}
			offer.RTPMap[payload] = strings.TrimSpace(parts[1])
		}
	}
	if offer.ConnectionIP == "" {
		return Offer{}, fmt.Errorf("sdp offer missing connection ip")
	}
	if offer.MediaPort == 0 {
		return Offer{}, fmt.Errorf("sdp offer missing audio media port")
	}
	return offer, nil
}

func (offer Offer) PreferredCodec() (Codec, bool) {
	for _, payload := range offer.Payloads {
		switch payload {
		case CodecPCMA.PayloadType:
			return CodecPCMA, true
		case CodecPCMU.PayloadType:
			return CodecPCMU, true
		}
	}
	return Codec{}, false
}

func Answer(publicIP string, rtpPort int, codec Codec) string {
	return strings.Join([]string{
		"v=0",
		fmt.Sprintf("o=assaddar 0 0 IN IP4 %s", publicIP),
		"s=Assaddar Voice Edge",
		fmt.Sprintf("c=IN IP4 %s", publicIP),
		"t=0 0",
		fmt.Sprintf("m=audio %d RTP/AVP %d", rtpPort, codec.PayloadType),
		fmt.Sprintf("a=rtpmap:%d %s/%d", codec.PayloadType, codec.Name, codec.ClockRate),
		"a=ptime:20",
		"a=sendrecv",
		"",
	}, "\r\n")
}
