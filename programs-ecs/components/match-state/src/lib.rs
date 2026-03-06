use bolt_lang::*;

declare_id!("23fHYfpHxeCdc38an2CzTkkoGAinN45XodaxVpofuJ1y");

#[component(delegate)]
pub struct MatchState {
    pub match_id: Pubkey,
    pub player1: Pubkey,
    pub player2: Pubkey,
    /// Current tick (increments each tick_match call)
    pub tick: u32,
    /// Ticks remaining in the match (30Hz * 120s = 3600)
    pub ticks_remaining: u32,
    pub p1_score: u32,
    pub p1_kills: u16,
    pub p2_score: u32,
    pub p2_kills: u16,
    pub is_active: bool,
    /// 0 = no winner yet, 1 = player1, 2 = player2, 3 = draw
    pub winner: u8,
}

impl Default for MatchState {
    fn default() -> Self {
        Self {
            bolt_metadata: BoltMetadata { authority: Pubkey::default() },
            match_id: Pubkey::default(),
            player1: Pubkey::default(),
            player2: Pubkey::default(),
            tick: 0,
            ticks_remaining: 3600,
            p1_score: 0,
            p1_kills: 0,
            p2_score: 0,
            p2_kills: 0,
            is_active: false,
            winner: 0,
        }
    }
}
