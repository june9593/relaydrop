# RelayDrop feed data contract

## Purpose

This document defines the first feed descriptor format. OneDrive drive-item metadata and a RelayDrop descriptor are both required to render an item.

## Version 1 descriptor

Required fields:

- schemaVersion: integer value 1
- id: lowercase UUID generated once by the sending client
- type: text, link, image, or file
- createdAt: UTC ISO-8601 timestamp supplied by the sending client
- source: phone, desktop, or tablet

Type-specific fields:

- text requires a text string.
- link requires a text string containing the original URL.
- image and file require a file object.
- image may contain an optional caption string.

The file object requires:

- driveItemId: identifier returned after the blob upload succeeds
- displayName: original user-facing file name
- size: non-negative integer byte count
- mediaType: browser-reported MIME type, or application/octet-stream when unavailable
- sha256: lowercase hexadecimal SHA-256 digest of the file bytes

Unknown fields are ignored for forward compatibility. Missing required fields, unknown type values, invalid identifiers, over-limit strings, and unsupported schema versions make a descriptor invalid.

## Identity and paths

The item UUID determines the descriptor path and blob parent path. The sanitized storage name determines the blob's final path segment. Retrying an item upload must reuse the same UUID unless an existing blob cannot be safely verified.

    feed/<uuid>.json
    blobs/<uuid>/<sanitized-storage-name>

The storage name is not displayed to the user. displayName is validated separately and used in the interface and download response.

## Ordering

OneDrive drive-item createdDateTime for the descriptor is the primary feed ordering value. The UUID is the ascending stable tie-breaker when timestamps match.

The descriptor createdAt value records the sending device's view of time for display and diagnostics. It is not trusted as the sole ordering value.

## Publication and idempotency

A descriptor is the publication marker:

- Text and link items become visible after their descriptor upload succeeds.
- File-backed items become visible only after the blob upload and descriptor upload both succeed.
- A blob without a descriptor is an orphan and is not shown.

Version 1 descriptors use canonical UTF-8 JSON with no insignificant whitespace. Top-level fields appear in this order when present: schemaVersion, id, type, createdAt, source, text, caption, file. File fields appear in this order: driveItemId, displayName, size, mediaType, sha256. Descriptor equivalence means byte-for-byte equality of that canonical representation.

Blob equivalence means both the exact byte length and SHA-256 content digest match. An ETag, file name, or media type alone is not sufficient.

The client creates each descriptor at a deterministic path without overwriting an unrelated existing object. When retrying:

- An equivalent descriptor at the same path means success.
- A blob may be reused only when its length and digest are verified.
- If an existing blob cannot be verified without unreasonable work, the client abandons that UUID, creates a new item UUID, and treats the old blob as an orphan.
- Different content at the same UUID path is a conflict and requires a new item UUID.

## Mutation

Version 1 descriptors are immutable after publication. Editing an existing item is not supported. Deletion removes the descriptor and its referenced blob.

Users can still alter OneDrive contents outside RelayDrop. Clients validate every fetched descriptor and treat missing referenced content as an unavailable item rather than executing or guessing replacement content.

## Limits

MVP limits:

- File size: 100 MB
- Text length: 20,000 characters
- Serialized descriptor size: 64 KiB
- File display name: 255 characters
- File media type: 255 characters
- Optional caption: 2,000 characters

File display names containing bidirectional or zero-width control characters are rejected. The current client loads 12 descriptors per page; page size is an interface and fetch-policy detail rather than part of the persisted schema.

## Future versions

New optional fields may be added without changing schemaVersion when older clients can safely ignore them. Breaking changes require a new schemaVersion. Clients skip unsupported versions and show a non-blocking compatibility warning.
