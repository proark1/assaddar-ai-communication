package media

import "testing"

func TestPortPoolLeaseRelease(t *testing.T) {
	pool, err := NewPortPool(30000, 30001)
	if err != nil {
		t.Fatalf("NewPortPool returned error: %v", err)
	}
	first, err := pool.Lease()
	if err != nil {
		t.Fatalf("first Lease returned error: %v", err)
	}
	second, err := pool.Lease()
	if err != nil {
		t.Fatalf("second Lease returned error: %v", err)
	}
	if first == second {
		t.Fatalf("leased duplicate port %d", first)
	}
	if _, err := pool.Lease(); err == nil {
		t.Fatal("expected exhausted pool error")
	}
	pool.Release(first)
	leased, err := pool.Lease()
	if err != nil {
		t.Fatalf("Lease after Release returned error: %v", err)
	}
	if leased != first {
		t.Fatalf("leased %d after releasing %d", leased, first)
	}
}
