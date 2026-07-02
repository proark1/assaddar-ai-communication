package g711

var alawSegmentEnd = [...]int16{0x1f, 0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff}

func DecodeALaw(value byte) int16 {
	value ^= 0x55
	sample := int16(value&0x0f) << 4
	segment := (value & 0x70) >> 4

	switch segment {
	case 0:
		sample += 8
	case 1:
		sample += 0x108
	default:
		sample += 0x108
		sample <<= segment - 1
	}

	if value&0x80 != 0 {
		return sample
	}
	return -sample
}

func EncodeALaw(sample int16) byte {
	var mask byte
	linear := int(sample)
	if linear >= 0 {
		mask = 0xd5
	} else {
		mask = 0x55
		linear = -linear - 1
	}
	linear >>= 3
	if linear > 0xfff {
		linear = 0xfff
	}

	segment := searchSegment(int16(linear))
	if segment >= 8 {
		return 0x7f ^ mask
	}

	encoded := byte(segment << 4)
	if segment < 2 {
		encoded |= byte((linear >> 4) & 0x0f)
	} else {
		encoded |= byte((linear >> (segment + 3)) & 0x0f)
	}
	return encoded ^ mask
}

func DecodeALawFrame(frame []byte) []int16 {
	out := make([]int16, len(frame))
	for i, sample := range frame {
		out[i] = DecodeALaw(sample)
	}
	return out
}

func EncodeALawFrame(frame []int16) []byte {
	out := make([]byte, len(frame))
	for i, sample := range frame {
		out[i] = EncodeALaw(sample)
	}
	return out
}

func searchSegment(sample int16) int {
	for i, end := range alawSegmentEnd {
		if sample <= end {
			return i
		}
	}
	return 8
}
