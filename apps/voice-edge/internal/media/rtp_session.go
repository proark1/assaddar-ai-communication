package media

import (
	"context"
	"errors"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/rtp"
)

type RTPSession struct {
	conn     *net.UDPConn
	pool     *PortPool
	remoteMu sync.RWMutex
	remote   *net.UDPAddr
	closed   atomic.Bool

	Port            int
	PayloadType     uint8
	SSRC            uint32
	SequenceNumber  uint16
	Timestamp       uint32
	PacketsReceived atomic.Uint64
	PacketsSent     atomic.Uint64
}

func OpenRTPSession(bindIP string, pool *PortPool, payloadType uint8) (*RTPSession, error) {
	port, err := pool.Lease()
	if err != nil {
		return nil, err
	}
	ip := net.ParseIP(bindIP)
	if ip == nil {
		ip = net.IPv4zero
	}
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: ip, Port: port})
	if err != nil {
		pool.Release(port)
		return nil, err
	}
	return &RTPSession{
		conn:        conn,
		pool:        pool,
		Port:        port,
		PayloadType: payloadType,
		SSRC:        1,
	}, nil
}

func (session *RTPSession) ReadLoop(ctx context.Context, onPacket func(rtp.Packet, *net.UDPAddr)) error {
	buffer := make([]byte, 1500)
	for {
		if err := session.conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond)); err != nil {
			return err
		}
		n, remote, err := session.conn.ReadFromUDP(buffer)
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				select {
				case <-ctx.Done():
					return nil
				default:
					continue
				}
			}
			return err
		}
		packet, err := rtp.ParsePacket(buffer[:n])
		if err != nil {
			continue
		}
		session.remoteMu.Lock()
		session.remote = remote
		session.remoteMu.Unlock()
		session.PacketsReceived.Add(1)
		if onPacket != nil {
			onPacket(packet, remote)
		}
	}
}

func (session *RTPSession) SendPayload(payload []byte) error {
	session.remoteMu.RLock()
	remote := session.remote
	session.remoteMu.RUnlock()
	if remote == nil {
		return errors.New("remote rtp address is not known yet")
	}
	packet := rtp.Packet{
		PayloadType:    session.PayloadType,
		SequenceNumber: session.SequenceNumber,
		Timestamp:      session.Timestamp,
		SSRC:           session.SSRC,
		Payload:        payload,
	}
	raw, err := packet.Marshal()
	if err != nil {
		return err
	}
	if _, err := session.conn.WriteToUDP(raw, remote); err != nil {
		return err
	}
	session.SequenceNumber++
	session.Timestamp += uint32(len(payload))
	session.PacketsSent.Add(1)
	return nil
}

func (session *RTPSession) SetRemote(remote *net.UDPAddr) {
	if remote == nil {
		return
	}
	remoteCopy := *remote
	session.remoteMu.Lock()
	session.remote = &remoteCopy
	session.remoteMu.Unlock()
}

func (session *RTPSession) Close() error {
	if session.closed.Swap(true) {
		return nil
	}
	session.pool.Release(session.Port)
	return session.conn.Close()
}
