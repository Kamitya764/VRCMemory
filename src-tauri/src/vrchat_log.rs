use regex::Regex;
use std::io::{BufRead, BufReader};
use std::path::Path;

use crate::error::{AppError, AppResult};

/// Represents a parsed VRChat log entry
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub enum LogEntry {
    WorldJoin {
        timestamp: String,
        world_name: String,
        world_id: String,
        instance_id: String,
        instance_type: InstanceType,
    },
    PlayerJoin {
        timestamp: String,
        player_name: String,
    },
    PlayerLeft {
        timestamp: String,
        player_name: String,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum InstanceType {
    Public,
    FriendsPlus,
    Friends,
    InvitePlus,
    Invite,
    Group,
    Unknown,
}

impl std::fmt::Display for InstanceType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InstanceType::Public => write!(f, "Public"),
            InstanceType::FriendsPlus => write!(f, "Friends+"),
            InstanceType::Friends => write!(f, "Friends"),
            InstanceType::InvitePlus => write!(f, "Invite+"),
            InstanceType::Invite => write!(f, "Invite"),
            InstanceType::Group => write!(f, "Group"),
            InstanceType::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Parser for VRChat output_log.txt files
pub struct VRChatLogParser {
    world_join_re: Regex,
    player_join_re: Regex,
    player_left_re: Regex,
}

impl VRChatLogParser {
    pub fn new() -> Self {
        Self {
            // VRChat log format: "2024.01.15 20:30:00 Log - [Behaviour] Entering Room: World Name"
            world_join_re: Regex::new(
                r"(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}) Log\s+-\s+\[Behaviour\] Entering Room: (.+)"
            ).expect("invalid world join regex"),

            // "2024.01.15 20:30:00 Log - [Behaviour] OnPlayerJoined PlayerName"
            player_join_re: Regex::new(
                r"(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}) Log\s+-\s+\[Behaviour\] OnPlayerJoined (.+)"
            ).expect("invalid player join regex"),

            // "2024.01.15 20:30:00 Log - [Behaviour] OnPlayerLeft PlayerName"
            player_left_re: Regex::new(
                r"(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}) Log\s+-\s+\[Behaviour\] OnPlayerLeft (.+)"
            ).expect("invalid player left regex"),
        }
    }

    /// Parse a VRChat log file and return all entries
    pub fn parse_file(&self, path: &Path) -> AppResult<Vec<LogEntry>> {
        let file = std::fs::File::open(path)
            .map_err(AppError::Io)?;
        let reader = BufReader::new(file);
        let mut entries = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(AppError::Io)?;
            if let Some(entry) = self.parse_line(&line) {
                entries.push(entry);
            }
        }

        Ok(entries)
    }

    /// Parse a single log line
    fn parse_line(&self, line: &str) -> Option<LogEntry> {
        // Try world join
        if let Some(caps) = self.world_join_re.captures(line) {
            let timestamp = caps.get(1)?.as_str().to_string();
            let room_info = caps.get(2)?.as_str().to_string();

            // Parse world ID from the room info if present
            // Format: "World Name wrld_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:12345~region(...)~nonce(...)"
            let (world_name, world_id, instance_id, instance_type) =
                Self::parse_room_info(&room_info);

            return Some(LogEntry::WorldJoin {
                timestamp,
                world_name,
                world_id,
                instance_id,
                instance_type,
            });
        }

        // Try player join
        if let Some(caps) = self.player_join_re.captures(line) {
            return Some(LogEntry::PlayerJoin {
                timestamp: caps.get(1)?.as_str().to_string(),
                player_name: caps.get(2)?.as_str().trim().to_string(),
            });
        }

        // Try player left
        if let Some(caps) = self.player_left_re.captures(line) {
            return Some(LogEntry::PlayerLeft {
                timestamp: caps.get(1)?.as_str().to_string(),
                player_name: caps.get(2)?.as_str().trim().to_string(),
            });
        }

        None
    }

    fn parse_room_info(info: &str) -> (String, String, String, InstanceType) {
        // Try to extract world ID (wrld_...)
        let world_id_re =
            Regex::new(r"(wrld_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
                .unwrap();

        let world_id = world_id_re
            .captures(info)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();

        // Extract world name (everything before the world ID or colon)
        let world_name = if !world_id.is_empty() {
            info.split(&world_id)
                .next()
                .unwrap_or(info)
                .trim()
                .to_string()
        } else {
            info.split(':')
                .next()
                .unwrap_or(info)
                .trim()
                .to_string()
        };

        // Extract instance ID and type
        let instance_id = info
            .split(':')
            .nth(1)
            .unwrap_or("")
            .split('~')
            .next()
            .unwrap_or("")
            .to_string();

        let instance_type = if info.contains("~hidden(") {
            InstanceType::FriendsPlus
        } else if info.contains("~friends(") {
            InstanceType::Friends
        } else if info.contains("~canRequestInvite(") {
            InstanceType::InvitePlus
        } else if info.contains("~private(") {
            InstanceType::Invite
        } else if info.contains("~group(") {
            InstanceType::Group
        } else if info.contains("~region(") {
            // Has region but no access type = public
            InstanceType::Public
        } else {
            InstanceType::Unknown
        };

        (world_name, world_id, instance_id, instance_type)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_player_join() {
        let parser = VRChatLogParser::new();
        let line = "2024.01.15 20:30:00 Log        -  [Behaviour] OnPlayerJoined TestUser";
        let entry = parser.parse_line(line);
        assert!(entry.is_some());
        if let Some(LogEntry::PlayerJoin { player_name, .. }) = entry {
            assert_eq!(player_name, "TestUser");
        }
    }

    #[test]
    fn test_parse_player_left() {
        let parser = VRChatLogParser::new();
        let line = "2024.01.15 20:35:00 Log        -  [Behaviour] OnPlayerLeft TestUser";
        let entry = parser.parse_line(line);
        assert!(entry.is_some());
        if let Some(LogEntry::PlayerLeft { player_name, .. }) = entry {
            assert_eq!(player_name, "TestUser");
        }
    }

    #[test]
    fn test_instance_type_display() {
        assert_eq!(InstanceType::Public.to_string(), "Public");
        assert_eq!(InstanceType::FriendsPlus.to_string(), "Friends+");
        assert_eq!(InstanceType::Friends.to_string(), "Friends");
    }
}
