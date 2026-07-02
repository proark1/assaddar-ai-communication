package media

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/assaddar/ai-communication/apps/voice-edge/internal/rtp"
)

func TestRTPSessionReceivesPacketAndReleasesPort(t *testing.T) {
	port := freeUDPPort(t)
	pool, err := NewPortPool(port, port)
	if err != nil {
		t.Fatalf("NewPortPool returned error: %v", err)
	}
	session, err := OpenRTPSession("127.0.0.1", pool, 8)
	if err != nil {
		t.Fatalf("OpenRTPSession returned error: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	received := make(chan rtp.Packet, 1)
	go func() {
		_ = session.ReadLoop(ctx, func(packet rtp.Packet, _ *net.UDPAddr) {
			received <- packet
		})
	}()

	conn, err := net.DialUDP("udp", nil, &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: session.Port})
	if err != nil {
		t.Fatalf("DialUDP returned error: %v", err)
	}
	defer conn.Close()
	raw, err := (rtp.Packet{PayloadType: 8, Payload: []byte{0xd5}}).Marshal()
	if err != nil {
		t.Fatalf("Marshal returned error: %v", err)
	}
	if _, err := conn.Write(raw); err != nil {
		t.Fatalf("Write returned error: %v", err)
	}
	select {
	case packet := <-received:
		if packet.PayloadType != 8 {
			t.Fatalf("PayloadType = %d", packet.PayloadType)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for RTP packet")
	}
	if err := session.Close(); err != nil {
		t.Fatalf("Close returned error: %v", err)
	}
	if _, err := pool.Lease(); err != nil {
		t.Fatalf("expected released port to be reusable: %v", err)
	}
}

func freeUDPPort(t *testing.T) int {
	t.Helper()
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatalf("ListenUDP for free port returned error: %v", err)
	}
	defer conn.Close()
	return conn.LocalAddr().(*net.UDPAddr).Port
}
