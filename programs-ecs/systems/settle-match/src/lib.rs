use bolt_lang::*;
use match_state::MatchState;
use player_pool::PlayerPool;

declare_id!("9wwqiBZ9zVDYoH5gMfHhh74M1BziEvupqgGDPwn2zne7");

#[system]
pub mod settle_match {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let ms = &mut ctx.accounts.match_state;
        let _pool = &ctx.accounts.player_pool;

        require!(!ms.is_active, ErrorSettleMatch::MatchStillActive);
        require!(ms.winner != 0, ErrorSettleMatch::NoWinnerDetermined);

        // Scores/kills live in PlayerPool, readable by client.
        // Future M5: token distribution logic will go here.

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
        pub player_pool: PlayerPool,
    }
}

#[error_code]
pub enum ErrorSettleMatch {
    #[msg("Match is still active, cannot settle")]
    MatchStillActive,
    #[msg("No winner has been determined yet")]
    NoWinnerDetermined,
}
