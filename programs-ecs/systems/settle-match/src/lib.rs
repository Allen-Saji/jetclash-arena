use bolt_lang::*;
use match_state::MatchState;
use player_state::PlayerState;

declare_id!("juvewJJY9UutyiH5jGJ2BS3n2RcWNhcKfMHwVvr6quz");

#[system]
pub mod settle_match {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let ms = &mut ctx.accounts.match_state;
        let p1 = &ctx.accounts.player_state_p1;
        let p2 = &ctx.accounts.player_state_p2;

        // Match must be over before settling back to L1
        require!(!ms.is_active, ErrorSettleMatch::MatchStillActive);
        require!(ms.winner != 0, ErrorSettleMatch::NoWinnerDetermined);

        // Snapshot final scores from player states into match state
        // (these should already be set by tick-combat, but we ensure consistency)
        ms.p1_score = p1.score;
        ms.p2_score = p2.score;
        ms.p1_kills = p1.kills;
        ms.p2_kills = p2.kills;

        // Future M5: token distribution logic will go here
        // - Read wager amount from match state
        // - Transfer tokens to winner (or split on draw)
        // - Emit settlement event

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_state_p1: PlayerState,
        pub player_state_p2: PlayerState,
    }
}

#[error_code]
pub enum ErrorSettleMatch {
    #[msg("Match is still active, cannot settle")]
    MatchStillActive,
    #[msg("No winner has been determined yet")]
    NoWinnerDetermined,
}
