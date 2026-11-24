use bytes::BytesMut;
use tokio_util::codec::{Decoder, Encoder};

#[derive(Debug, Default)]
pub struct LineCodec;

impl Decoder for LineCodec {
    type Item = String;
    type Error = std::io::Error;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        if let Some(i) = src.iter().position(|b| *b == b'\n') {
            let line = src.split_to(i);
            let _ = src.split_to(1); // consume \n
            let s = String::from_utf8_lossy(&line).trim().to_string();
            if s.is_empty() {
                return Ok(None);
            }
            return Ok(Some(s));
        }
        Ok(None)
    }
}

impl Encoder<String> for LineCodec {
    type Error = std::io::Error;

    fn encode(&mut self, item: String, dst: &mut BytesMut) -> Result<(), Self::Error> {
        dst.extend_from_slice(item.as_bytes());
        if !item.ends_with('\n') {
            dst.extend_from_slice(b"\n");
        }
        Ok(())
    }
}

pub fn encode_json_line<T: serde::Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::BytesMut;

    #[test]
    fn decode_lines() {
        let mut codec = LineCodec;
        let mut buf = BytesMut::from(&b"{\"a\":1}\n{\"b\":2}\n"[..]);
        assert_eq!(codec.decode(&mut buf).unwrap().unwrap(), "{\"a\":1}");
        assert_eq!(codec.decode(&mut buf).unwrap().unwrap(), "{\"b\":2}");
    }
}
