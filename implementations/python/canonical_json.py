"""EXP RFC 8785-style canonical JSON helpers shared by public Python adapters."""

from __future__ import annotations

import json
import math
from typing import Any

MAX_PAYLOAD_BYTES = 1_048_576
MAX_DEPTH = 16
MAX_ARRAY_ITEMS = 100
MAX_OBJECT_PROPERTIES = 100
MAX_STRING_CODE_UNITS = 4_096


class CanonicalJsonError(TypeError):
    """Raised when a value cannot have portable canonical JSON bytes."""


def _resource_check(value: Any, depth: int = 0, active: set[int] | None = None) -> None:
    active = set() if active is None else active
    if isinstance(value, str):
        if len(value) > MAX_STRING_CODE_UNITS:
            raise CanonicalJsonError("RESOURCE_STRING_TOO_LARGE")
        return
    if value is None or isinstance(value, (bool, int, float)):
        return
    if depth > MAX_DEPTH:
        raise CanonicalJsonError("RESOURCE_NESTING_TOO_DEEP")
    identity = id(value)
    if identity in active:
        raise CanonicalJsonError("RESOURCE_NESTING_TOO_DEEP")
    active.add(identity)
    if isinstance(value, list):
        if len(value) > MAX_ARRAY_ITEMS:
            raise CanonicalJsonError("RESOURCE_ARRAY_TOO_LARGE")
        for item in value:
            _resource_check(item, depth + 1, active)
    elif isinstance(value, dict):
        if len(value) > MAX_OBJECT_PROPERTIES:
            raise CanonicalJsonError("RESOURCE_OBJECT_TOO_LARGE")
        for key, item in value.items():
            _resource_check(key, depth + 1, active)
            _resource_check(item, depth + 1, active)
    else:
        raise CanonicalJsonError("Canonical JSON only supports JSON values.")
    active.remove(identity)


def _validate_string(value: str) -> None:
    for character in value:
        codepoint = ord(character)
        if 0xD800 <= codepoint <= 0xDFFF:
            raise CanonicalJsonError("Canonical JSON strings must contain well-formed Unicode.")


def _sort_key(value: str) -> bytes:
    # RFC 8785 orders object names by UTF-16 code units, not Unicode scalar values.
    return value.encode("utf-16-be")


def _number(value: int | float) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        if abs(value) > 2**53 - 1:
            raise CanonicalJsonError("Canonical JSON integers must be IEEE-754 safe.")
        return str(value)
    if not math.isfinite(value):
        raise CanonicalJsonError("Canonical JSON does not support non-finite numbers.")
    if value == 0:
        return "0"

    representation = repr(value)
    if "e" not in representation and "E" not in representation:
        return representation[:-2] if representation.endswith(".0") else representation

    mantissa, exponent_text = representation.lower().split("e")
    exponent = int(exponent_text)
    sign = ""
    if mantissa.startswith("-"):
        sign, mantissa = "-", mantissa[1:]
    digits = mantissa.replace(".", "")
    decimal_position = mantissa.find(".")
    if decimal_position < 0:
        decimal_position = len(mantissa)
    decimal_position += exponent

    # ECMAScript uses decimal notation for [1e-6, 1e21).
    if -6 <= exponent < 21:
        if decimal_position <= 0:
            return f"{sign}0.{('0' * -decimal_position)}{digits}"
        if decimal_position >= len(digits):
            return f"{sign}{digits}{'0' * (decimal_position - len(digits))}"
        return f"{sign}{digits[:decimal_position]}.{digits[decimal_position:]}"

    normalized_mantissa = digits[0]
    if len(digits) > 1:
        normalized_mantissa += f".{digits[1:]}"
    exponent_sign = "+" if exponent >= 0 else "-"
    return f"{sign}{normalized_mantissa}e{exponent_sign}{abs(exponent)}"


def canonical_json(value: Any) -> str:
    """Return deterministic RFC 8785 JSON for JSON-compatible values."""
    _resource_check(value)
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _number(value)
    if isinstance(value, str):
        _validate_string(value)
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, list):
        return f"[{','.join(canonical_json(item) for item in value)}]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise CanonicalJsonError("Canonical JSON object names must be strings.")
        entries = []
        for key in sorted(value, key=_sort_key):
            _validate_string(key)
            entries.append(f"{json.dumps(key, ensure_ascii=False)}:{canonical_json(value[key])}")
        return f"{{{','.join(entries)}}}"
    raise CanonicalJsonError("Canonical JSON only supports JSON values.")


def canonical_json_bytes(value: Any) -> bytes:
    """Return UTF-8 bytes of the deterministic canonical JSON representation."""
    _resource_check(value)
    payload = canonical_json(value).encode("utf-8")
    if len(payload) > MAX_PAYLOAD_BYTES:
        raise CanonicalJsonError("RESOURCE_PAYLOAD_TOO_LARGE")
    return payload


def without_fields(value: dict[str, Any], fields: set[str]) -> dict[str, Any]:
    """Remove signature envelope fields before canonical signing."""
    return {key: item for key, item in value.items() if key not in fields}


def signed_payload_bytes(value: dict[str, Any], omitted_fields: set[str]) -> bytes:
    """Return canonical bytes after removing one or more envelope fields."""
    return canonical_json_bytes(without_fields(value, omitted_fields))
