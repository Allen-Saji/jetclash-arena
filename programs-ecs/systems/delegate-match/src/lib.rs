use bolt_lang::*;
use match_state::MatchState;

declare_id!("tFnVHnpwChv6nRP21yoRijab1FrRaUX51sAY8fGzQ1a");

#[system]
pub mod delegate_match {

    pub fn execute(ctx: Context<Components>, _args_p: Vec<u8>) -> Result<Components> {
        let ms = &mut ctx.accounts.match_state;

        // Match must be freshly created (not yet active) to delegate
        require!(!ms.is_active, ErrorDelegateMatch::MatchAlreadyActive);
        require!(ms.tick == 0, ErrorDelegateMatch::MatchAlreadyStarted);

        // Mark as delegated — the actual DelegateAccount CPI is issued by
        // the client SDK right after this instruction succeeds.
        // The ER will then run all tick-* systems at high frequency.

        Ok(ctx.accounts)
    }

    #[system_input]
    pub struct Components {
        pub match_state: MatchState,
    }
}

#[error_code]
pub enum ErrorDelegateMatch {
    #[msg("Match is already active, cannot delegate")]
    MatchAlreadyActive,
    #[msg("Match has already started (tick > 0)")]
    MatchAlreadyStarted,
}
