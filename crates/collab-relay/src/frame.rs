use thiserror::Error;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RelayFrameType {
    Awareness,
    QueryAwareness,
    EncryptedSync,
    EncryptedSyncQuery,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RelayFrame {
    pub frame_type: RelayFrameType,
    pub payload: Option<Vec<u8>>,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum FrameError {
    #[error("invalid varuint")]
    InvalidVarUint,
    #[error("unknown frame type {0}")]
    UnknownFrameType(u64),
    #[error("payload is shorter than declared length")]
    TruncatedPayload,
}

impl RelayFrameType {
    pub fn wire_value(self) -> u64 {
        match self {
            Self::Awareness => 1,
            Self::QueryAwareness => 3,
            Self::EncryptedSync => 10,
            Self::EncryptedSyncQuery => 11,
        }
    }

    fn from_wire_value(value: u64) -> Result<Self, FrameError> {
        match value {
            1 => Ok(Self::Awareness),
            3 => Ok(Self::QueryAwareness),
            10 => Ok(Self::EncryptedSync),
            11 => Ok(Self::EncryptedSyncQuery),
            other => Err(FrameError::UnknownFrameType(other)),
        }
    }
}

pub fn encode_type_frame(frame_type: RelayFrameType) -> Vec<u8> {
    encode_varuint(frame_type.wire_value())
}

pub fn encode_payload_frame(frame_type: RelayFrameType, payload: &[u8]) -> Vec<u8> {
    let mut frame = encode_type_frame(frame_type);
    frame.extend(encode_varuint(payload.len() as u64));
    frame.extend(payload);
    frame
}

pub fn decode_frame(bytes: &[u8]) -> Result<RelayFrame, FrameError> {
    let mut offset = 0;
    let frame_type = RelayFrameType::from_wire_value(decode_varuint(bytes, &mut offset)?)?;
    if offset >= bytes.len() {
        return Ok(RelayFrame {
            frame_type,
            payload: None,
        });
    }

    let payload_len = decode_varuint(bytes, &mut offset)? as usize;
    let end = offset.saturating_add(payload_len);
    if end > bytes.len() {
        return Err(FrameError::TruncatedPayload);
    }

    Ok(RelayFrame {
        frame_type,
        payload: Some(bytes[offset..end].to_vec()),
    })
}

fn encode_varuint(value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut next = value;
    while next > 0x7f {
        bytes.push(((next & 0x7f) as u8) | 0x80);
        next /= 128;
    }
    bytes.push(next as u8);
    bytes
}

fn decode_varuint(bytes: &[u8], offset: &mut usize) -> Result<u64, FrameError> {
    let mut value = 0u64;
    let mut multiplier = 1u64;
    while *offset < bytes.len() {
        let byte = bytes[*offset];
        *offset += 1;
        value += ((byte & 0x7f) as u64) * multiplier;
        if byte < 0x80 {
            return Ok(value);
        }
        multiplier = multiplier
            .checked_mul(128)
            .ok_or(FrameError::InvalidVarUint)?;
    }
    Err(FrameError::InvalidVarUint)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_and_decodes_encrypted_payload_frames() {
        let frame = encode_payload_frame(RelayFrameType::EncryptedSync, b"ciphertext");
        let decoded = decode_frame(&frame).expect("frame decodes");

        assert_eq!(decoded.frame_type, RelayFrameType::EncryptedSync);
        assert_eq!(decoded.payload.as_deref(), Some(&b"ciphertext"[..]));
    }

    #[test]
    fn encodes_and_decodes_query_frames_without_payload() {
        let frame = encode_type_frame(RelayFrameType::EncryptedSyncQuery);
        let decoded = decode_frame(&frame).expect("frame decodes");

        assert_eq!(decoded.frame_type, RelayFrameType::EncryptedSyncQuery);
        assert_eq!(decoded.payload, None);
    }

    #[test]
    fn rejects_truncated_payload_frames() {
        let mut frame = encode_payload_frame(RelayFrameType::Awareness, b"abc");
        frame.pop();

        assert!(matches!(
            decode_frame(&frame),
            Err(FrameError::TruncatedPayload)
        ));
    }
}
