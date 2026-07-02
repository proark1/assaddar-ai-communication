package g711

const uLawBias = 0x84
const uLawClip = 32635

var uLawSegmentEnd = [...]int16{0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff}

func DecodeULaw(value byte) int16 {
	value = ^value
	t := int16(((value & 0x0f) << 3)) + uLawBias
	t <<= (value & 0x70) >> 4
	if value&0x80 != 0 {
		return uLawBias - t
	}
	return t - uLawBias
}

func EncodeULaw(sample int16) byte {
	var mask byte
	pcm := int(sample)
	if pcm < 0 {
		pcm = uLawBias - pcm
		mask = 0x7f
	} else {
		pcm += uLawBias
		mask = 0xff
	}
	if pcm > uLawClip {
		pcm = uLawClip
	}
	segment := searchULawSegment(int16(pcm >> 2))
	encoded := byte(segment<<4) | byte((pcm>>(segment+3))&0x0f)
	return encoded ^ mask
}

func DecodeULawFrame(frame []byte) []int16 {
	out := make([]int16, len(frame))
	for i, sample := range frame {
		out[i] = DecodeULaw(sample)
	}
	return out
}

func EncodeULawFrame(frame []int16) []byte {
	out := make([]byte, len(frame))
	for i, sample := range frame {
		out[i] = EncodeULaw(sample)
	}
	return out
}

func searchULawSegment(sample int16) int {
	for i, end := range uLawSegmentEnd {
		if sample <= end {
			return i
		}
	}
	return 7
}
