use std::net::TcpListener;

/// Finds an available unassigned dynamic TCP port on loopback interface 127.0.0.1.
pub fn find_free_port() -> Result<u16, String> {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .map_err(|e| format!("Failed to bind to free port: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_free_port() {
        let port1 = find_free_port().expect("Should find port 1");
        let port2 = find_free_port().expect("Should find port 2");
        assert!(port1 > 0);
        assert!(port2 > 0);
        assert_ne!(port1, port2);
    }
}
