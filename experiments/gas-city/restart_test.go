// Supplemental contract test against unchanged upstream source. Local test only.
package api

import (
 "testing"
 "time"
)

func TestPlatesRestartLosesCreateDedup(t *testing.T) {
 before := newIdempotencyCache(time.Hour)
 before.reserve("acme-operation", "acme-body")
 before.complete("acme-operation", 202, "acme-request", "acme-body")
 if _, found := before.reserve("acme-operation", "acme-body"); !found { t.Fatal("same-process retry must be remembered") }
 after := newIdempotencyCache(time.Hour)
 if _, found := after.reserve("acme-operation", "acme-body"); found { t.Fatal("new server unexpectedly recovered process-memory dedup") }
}
