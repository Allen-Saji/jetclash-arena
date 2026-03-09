use bolt_lang::*;

declare_id!("5ycjVn86LtopfCGL8hLVYp3KTQzTvGyDfTVSXGAKirnB");

pub const MAX_PLAYERS: usize = 4;

#[component(delegate)]
pub struct MatchState {
    /// Player wallet pubkeys (up to 4). players[0] is the host.
    pub players: [Pubkey; MAX_PLAYERS],
    pub player_count: u8,
    /// Bitfield: bit i = player i is ready
    pub ready_mask: u8,
    /// true while in lobby waiting for players
    pub is_lobby: bool,
    /// Minimum players required to start (default 2)
    pub min_players: u8,
    /// Current tick (increments each tick_match call)
    pub tick: u32,
    /// Ticks remaining in the match (30Hz * 120s = 3600)
    pub ticks_remaining: u32,
    pub is_active: bool,
    /// 0 = no winner yet, 1-4 = player index+1, 5 = draw
    pub winner: u8,
}

impl Default for MatchState {
    fn default() -> Self {
        Self {
            bolt_metadata: BoltMetadata { authority: Pubkey::default() },
            players: [Pubkey::default(); MAX_PLAYERS],
            player_count: 0,
            ready_mask: 0,
            is_lobby: false,
            min_players: 2,
            tick: 0,
            ticks_remaining: 3600,
            is_active: false,
            winner: 0,
        }
    }
}
