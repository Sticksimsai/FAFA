use solana_sha256_hasher::hashv;
use solana_curve25519::edwards::{validate_edwards,PodEdwardsPoint};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{Instruction,AccountMeta},program::invoke_signed};
use anchor_spl::{associated_token::AssociatedToken, token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked, CloseAccount}};
use orao_solana_vrf::{program::OraoVrf, state::RandomnessV2};

declare_id!("2GkgTZzY9EPg4WbedhGWQNYkeqoXNUYmcbB27dUMF4NE");
const BABA: Pubkey = Pubkey::new_from_array([150,238,150,15,254,255,169,77,8,30,124,167,42,85,15,238,111,185,190,251,17,57,13,126,10,243,90,190,0,5,123,191]);
const NATIVE: Pubkey = Pubkey::new_from_array([6,155,136,87,254,171,129,132,251,104,127,99,70,24,192,53,218,196,57,220,26,235,59,85,152,160,240,0,0,0,0,1]);
const FAFA: Pubkey = Pubkey::from_str_const("CcSRXUReR3VVG92C4rE8FqsLomzwmH6Dn1WhTGebpump");
const MIN_HOLDING: u64 = 1_000_000; // One token for supported six-decimal launches.

#[program]
pub mod fafa_red_envelope {
    use super::*;
    // Permissionless WSOL unwrapping: only this vault's native-mint ATA,
    // only into this same vault. No caller-selected destination or amount.
    pub fn unwrap_native(ctx:Context<UnwrapNative>)->Result<()>{
        let v=&ctx.accounts.vault;let mint=v.mint;let bump=[v.bump];let seeds:&[&[u8]]=&[b"red-envelope",mint.as_ref(),&bump];
        token_interface::close_account(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),CloseAccount{account:ctx.accounts.quote_vault.to_account_info(),destination:ctx.accounts.vault.to_account_info(),authority:ctx.accounts.vault.to_account_info()},&[seeds]))
    }
    // Only the two pinned Meteora fee-claim instructions can borrow the PDA
    // signature. Both destinations and mints are fixed; no swap/withdraw/CPI proxy.
    pub fn harvest_baba<'info>(ctx:Context<'_, '_, '_, 'info, HarvestBaba<'info>>,data:Vec<u8>)->Result<()>{
        let v=&ctx.accounts.vault;let a=ctx.remaining_accounts;
        let program=ctx.accounts.fee_program.key();
        let dbc=Pubkey::from_str_const("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
        let damm=Pubkey::new_from_array([9,45,33,53,101,122,21,156,43,135,212,182,106,112,219,142,151,82,56,159,247,106,175,32,108,237,6,58,56,249,90,237]);
        let signer_index;
        if program==dbc {require!(a.len()==14&&data.len()==24&&data[..8]==[8,236,89,49,152,125,177,81],ErrorCode::InvalidFeeClaim);signer_index=9;}
        else if program==damm {require!(a.len()==15&&data==[180,38,154,17,133,33,162,211],ErrorCode::InvalidFeeClaim);signer_index=10;}
        else{return err!(ErrorCode::InvalidFeeClaim)}
        require_keys_eq!(*a[3].key,ctx.accounts.base_vault.key(),ErrorCode::InvalidFeeClaim);
        require_keys_eq!(*a[4].key,ctx.accounts.quote_vault.key(),ErrorCode::InvalidFeeClaim);
        require_keys_eq!(*a[7].key,v.mint,ErrorCode::InvalidFeeClaim);
        require_keys_eq!(*a[8].key,v.quote_mint,ErrorCode::InvalidFeeClaim);
        require_keys_eq!(*a[signer_index].key,v.key(),ErrorCode::InvalidFeeClaim);
        require_keys_eq!(*a[a.len()-1].key,program,ErrorCode::InvalidFeeClaim);
        let before_base=ctx.accounts.base_vault.amount;let before_quote=ctx.accounts.quote_vault.amount;
        let ix=Instruction{program_id:program,data,accounts:a.iter().enumerate().map(|(i,x)|AccountMeta{pubkey:*x.key,is_writable:x.is_writable,is_signer:i==signer_index}).collect()};
        let mint=v.mint;let bump=[v.bump];let seeds:&[&[u8]]=&[b"red-envelope",mint.as_ref(),&bump];
        let mut infos=a.to_vec();infos.push(ctx.accounts.fee_program.to_account_info());
        invoke_signed(&ix,&infos,&[seeds])?;
        ctx.accounts.base_vault.reload()?;ctx.accounts.quote_vault.reload()?;
        require!(ctx.accounts.base_vault.amount>=before_base&&ctx.accounts.quote_vault.amount>=before_quote,ErrorCode::InvalidFeeClaim);
        Ok(())
    }
    pub fn initialize(ctx: Context<Initialize>, snapshot_authority: Pubkey) -> Result<()> {
        require!(validate_edwards(&PodEdwardsPoint(snapshot_authority.to_bytes())), ErrorCode::InvalidConfig);
        ctx.accounts.config.snapshot_authority = snapshot_authority;
        Ok(())
    }
    pub fn create_vault(ctx: Context<CreateVault>, cycle_seconds: i64) -> Result<()> {
        require!([3600,21600,86400].contains(&cycle_seconds), ErrorCode::InvalidConfig);
        let quote=ctx.accounts.quote_mint.key();
        require!(quote==NATIVE||quote==BABA||quote==FAFA, ErrorCode::InvalidConfig);
        require!(ctx.accounts.quote_mint.decimals==if quote==NATIVE {9}else{6}, ErrorCode::InvalidConfig);
        let v=&mut ctx.accounts.vault;
        v.mint=ctx.accounts.mint.key(); v.creator=ctx.accounts.creator.key(); v.quote_mint=quote;
        v.cycle_seconds=cycle_seconds; v.next_due=Clock::get()?.unix_timestamp.checked_add(cycle_seconds).ok_or(ErrorCode::Overflow)?;
        v.bump=ctx.bumps.vault; v.sequence=0; v.pending=false;
        Ok(())
    }
    // Snapshot commitment and fresh VRF request are atomic. The snapshot keeper
    // attests completeness; anyone can independently audit its published list.
    pub fn begin_round(ctx: Context<BeginRound>, sequence:u64, root:[u8;32], count:u32, snapshot_slot:u64) -> Result<()> {
        let clock=Clock::get()?;let v=&ctx.accounts.vault;
        require!(!v.pending&&v.sequence==sequence&&clock.unix_timestamp>=v.next_due,ErrorCode::NotDue);
        require!(root!=[0;32]&&count>0&&count<=1_000_000,ErrorCode::InvalidSnapshot);
        require!(snapshot_slot<=clock.slot&&clock.slot-snapshot_slot<=300,ErrorCode::InvalidSnapshot);
        let reward=if v.quote_mint==NATIVE { ctx.accounts.vault.to_account_info().lamports().checked_sub(Rent::get()?.minimum_balance(8+Vault::INIT_SPACE)).ok_or(ErrorCode::Overflow)? }else{ctx.accounts.quote_vault.amount};
        require!(reward>=if v.quote_mint==NATIVE {10_000_000}else if v.quote_mint==FAFA {100_000_000}else{10_000},ErrorCode::InsufficientReward);
        let seed=hashv(&[b"fafa-round-v1",v.key().as_ref(),&sequence.to_le_bytes(),&root,&snapshot_slot.to_le_bytes()]).to_bytes();
        let expected=Pubkey::find_program_address(&[orao_solana_vrf::RANDOMNESS_ACCOUNT_SEED,&seed],&orao_solana_vrf::ID).0;
        require_keys_eq!(ctx.accounts.randomness.key(),expected,ErrorCode::WrongRandomness);
        require!(ctx.accounts.randomness.data_is_empty()&&ctx.accounts.randomness.owner==&System::id(),ErrorCode::WrongRandomness);
        // A pre-requested seed is rejected above, preventing seed grinding.
        orao_solana_vrf::cpi::request_v2(CpiContext::new(ctx.accounts.vrf.to_account_info(),orao_solana_vrf::cpi::accounts::RequestV2 {
            payer:ctx.accounts.snapshot_authority.to_account_info(),network_state:ctx.accounts.network_state.to_account_info(),treasury:ctx.accounts.treasury.to_account_info(),request:ctx.accounts.randomness.to_account_info(),system_program:ctx.accounts.system_program.to_account_info()
        }),seed)?;
        let r=&mut ctx.accounts.round;
        r.vault=v.key();r.sequence=sequence;r.root=root;r.count=count;r.snapshot_slot=snapshot_slot;r.reward=reward;r.base_reward=ctx.accounts.base_vault.amount;
        r.randomness=ctx.accounts.randomness.key();r.seed=seed;r.requester=ctx.accounts.snapshot_authority.key();r.paid=false;r.winner=Pubkey::default();r.started_at=clock.unix_timestamp;
        ctx.accounts.vault.pending=true;
        emit!(RoundOpened{vault:r.vault,sequence,root,count,snapshot_slot,reward,randomness:r.randomness});
        Ok(())
    }
    // No administrator withdrawal, cancellation, alternate winner or reroll.
    pub fn settle_round(ctx:Context<SettleRound>,index:u32,balance:u64,proof:Vec<[u8;32]>) -> Result<()> {
        let v=&ctx.accounts.vault;let r=&ctx.accounts.round;
        require!(v.pending&&!r.paid&&v.sequence==r.sequence,ErrorCode::AlreadyPaid);
        require!(balance>=MIN_HOLDING&&index<r.count&&proof.len()<=20,ErrorCode::InvalidProof);
        let winner=ctx.accounts.winner.key();
        require!(validate_edwards(&PodEdwardsPoint(winner.to_bytes()))&&winner!=v.creator&&winner!=Pubkey::default(),ErrorCode::InvalidProof);
        let random=ctx.accounts.randomness.fulfilled().ok_or(ErrorCode::RandomnessPending)?;
        require!(random.seed==r.seed&&random.client==r.requester,ErrorCode::WrongRandomness);
        require!(select_winner(&random.randomness,r.count)?==index,ErrorCode::WrongWinner);
        let mut node=holder_leaf(&v.key(),r.sequence,index,&winner,balance);let mut i=index;
        for sibling in proof {node=if i%2==0 {hashv(&[b"fafa-node-v1".as_slice(),&node,&sibling]).to_bytes()}else{hashv(&[b"fafa-node-v1".as_slice(),&sibling,&node]).to_bytes()};i/=2;}
        require!(node==r.root,ErrorCode::InvalidProof);
        let reward=r.reward;let base_reward=r.base_reward;let sequence=r.sequence;
        if v.quote_mint!=NATIVE {
            let mint=v.mint;let bump=[v.bump];let seeds:&[&[u8]]=&[b"red-envelope",mint.as_ref(),&bump];
            token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),TransferChecked{from:ctx.accounts.quote_vault.to_account_info(),mint:ctx.accounts.quote_mint.to_account_info(),to:ctx.accounts.winner_tokens.to_account_info(),authority:ctx.accounts.vault.to_account_info()},&[seeds]),reward,ctx.accounts.quote_mint.decimals)?;
        }
        if base_reward>0 {
            let mint=v.mint;let bump=[v.bump];let seeds:&[&[u8]]=&[b"red-envelope",mint.as_ref(),&bump];
            token_interface::transfer_checked(CpiContext::new_with_signer(ctx.accounts.base_token_program.to_account_info(),TransferChecked{from:ctx.accounts.base_vault.to_account_info(),mint:ctx.accounts.base_mint.to_account_info(),to:ctx.accounts.winner_base_tokens.to_account_info(),authority:ctx.accounts.vault.to_account_info()},&[seeds]),base_reward,ctx.accounts.base_mint.decimals)?;
        }
        // Complete token CPIs before directly moving native lamports.
        if v.quote_mint==NATIVE {
            let vault_info=ctx.accounts.vault.to_account_info();let winner_info=ctx.accounts.winner.to_account_info();
            let remaining=vault_info.lamports().checked_sub(reward).ok_or(ErrorCode::InsufficientReward)?;
            require!(remaining>=Rent::get()?.minimum_balance(8+Vault::INIT_SPACE),ErrorCode::InsufficientReward);
            **vault_info.try_borrow_mut_lamports()?=remaining;
            **winner_info.try_borrow_mut_lamports()?=winner_info.lamports().checked_add(reward).ok_or(ErrorCode::Overflow)?;
        }
        let v=&mut ctx.accounts.vault;v.pending=false;v.sequence=v.sequence.checked_add(1).ok_or(ErrorCode::Overflow)?;
        v.next_due=Clock::get()?.unix_timestamp.checked_add(v.cycle_seconds).ok_or(ErrorCode::Overflow)?;
        let r=&mut ctx.accounts.round;r.paid=true;r.winner=winner;
        emit!(RoundPaid{vault:v.key(),sequence,winner,reward,base_reward});Ok(())
    }
}

pub fn holder_leaf(vault:&Pubkey,sequence:u64,index:u32,wallet:&Pubkey,balance:u64)->[u8;32]{hashv(&[b"fafa-holder-v1",vault.as_ref(),&sequence.to_le_bytes(),&index.to_le_bytes(),wallet.as_ref(),&balance.to_le_bytes()]).to_bytes()}
pub fn select_winner(random:&[u8;64],count:u32)->Result<u32>{
    require!(count>0&&count<=1_000_000,ErrorCode::InvalidSnapshot);
    let size=1u128<<64;let limit=size-size%(count as u128);
    for counter in 0u32..256 {let hash=hashv(&[b"fafa-winner-v1".as_slice(),random,&counter.to_le_bytes()]).to_bytes();let n=u64::from_le_bytes(hash[..8].try_into().unwrap());if (n as u128)<limit{return Ok((n%(count as u64))as u32)}}
    err!(ErrorCode::WrongRandomness)
}

#[derive(Accounts)]
pub struct UnwrapNative<'info>{
    #[account(mut,seeds=[b"red-envelope",vault.mint.as_ref()],bump=vault.bump,constraint=vault.quote_mint==NATIVE)]pub vault:Box<Account<'info,Vault>>,
    #[account(address=NATIVE)]pub quote_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(mut,associated_token::mint=quote_mint,associated_token::authority=vault,associated_token::token_program=token_program)]pub quote_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    pub token_program:Interface<'info,TokenInterface>
}
#[derive(Accounts)]
pub struct HarvestBaba<'info>{
    #[account(seeds=[b"red-envelope",vault.mint.as_ref()],bump=vault.bump,constraint=vault.quote_mint==BABA||vault.quote_mint==FAFA)]pub vault:Box<Account<'info,Vault>>,
    #[account(address=vault.mint)]pub base_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(address=vault.quote_mint)]pub quote_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(mut,associated_token::mint=base_mint,associated_token::authority=vault,associated_token::token_program=base_token_program)]pub base_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    #[account(mut,associated_token::mint=quote_mint,associated_token::authority=vault,associated_token::token_program=token_program)]pub quote_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    pub token_program:Interface<'info,TokenInterface>,pub base_token_program:Interface<'info,TokenInterface>,
    /// CHECK: executable plus fixed allowlist and instruction validation in handler.
    #[account(executable)]pub fee_program:UncheckedAccount<'info>
}
#[derive(Accounts)]
pub struct Initialize<'info>{
    #[account(mut)]pub authority:Signer<'info>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program:Program<'info,crate::program::FafaRedEnvelope>,
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()))]
    pub program_data:Box<Account<'info,ProgramData>>,
    #[account(init,payer=authority,space=8+Config::INIT_SPACE,seeds=[b"config"],bump)]pub config:Box<Account<'info,Config>>,
    pub system_program:Program<'info,System>
}
#[derive(Accounts)]
pub struct CreateVault<'info>{
    #[account(mut)]pub creator:Signer<'info>,
    // Requiring the new mint's signature prevents squatting an existing token vault.
    #[account(signer,constraint=mint.decimals==6 @ ErrorCode::InvalidConfig)]pub mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(seeds=[b"config"],bump)]pub config:Box<Account<'info,Config>>,
    pub quote_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(init,payer=creator,space=8+Vault::INIT_SPACE,seeds=[b"red-envelope",mint.key().as_ref()],bump)]pub vault:Box<Account<'info,Vault>>,
    #[account(init_if_needed,payer=creator,associated_token::mint=quote_mint,associated_token::authority=vault,associated_token::token_program=token_program)]pub quote_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    #[account(init_if_needed,payer=creator,associated_token::mint=mint,associated_token::authority=vault,associated_token::token_program=base_token_program)]pub base_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    pub base_token_program:Interface<'info,TokenInterface>,
    pub token_program:Interface<'info,TokenInterface>,pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]
#[instruction(sequence:u64)]
pub struct BeginRound<'info>{
    #[account(mut)]pub snapshot_authority:Signer<'info>,
    #[account(seeds=[b"config"],bump,has_one=snapshot_authority)]pub config:Box<Account<'info,Config>>,
    #[account(mut,seeds=[b"red-envelope",vault.mint.as_ref()],bump=vault.bump)]pub vault:Box<Account<'info,Vault>>,
    #[account(address=vault.quote_mint)]pub quote_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(associated_token::mint=quote_mint,associated_token::authority=vault,associated_token::token_program=token_program)]pub quote_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    #[account(address=vault.mint)]pub base_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(associated_token::mint=base_mint,associated_token::authority=vault,associated_token::token_program=base_token_program)]pub base_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    pub base_token_program:Interface<'info,TokenInterface>,
    #[account(init,payer=snapshot_authority,space=8+Round::INIT_SPACE,seeds=[b"round",vault.key().as_ref(),&sequence.to_le_bytes()],bump)]pub round:Box<Account<'info,Round>>,
    /// CHECK: exact PDA derived from seed and fresh empty system account checked in handler; ORAO initializes it.
    #[account(mut)]pub randomness:UncheckedAccount<'info>,
    /// CHECK: ORAO CPI validates network state PDA and ownership.
    #[account(mut)]pub network_state:UncheckedAccount<'info>,
    /// CHECK: ORAO CPI validates treasury against network state.
    #[account(mut)]pub treasury:UncheckedAccount<'info>,
    pub vrf:Program<'info,OraoVrf>,pub token_program:Interface<'info,TokenInterface>,pub system_program:Program<'info,System>
}
#[derive(Accounts)]
pub struct SettleRound<'info>{
    #[account(mut)]pub payer:Signer<'info>,
    #[account(mut,seeds=[b"red-envelope",vault.mint.as_ref()],bump=vault.bump)]pub vault:Box<Account<'info,Vault>>,
    #[account(mut,has_one=vault,seeds=[b"round",vault.key().as_ref(),&round.sequence.to_le_bytes()],bump)]pub round:Box<Account<'info,Round>>,
    #[account(address=round.randomness)]pub randomness:Box<Account<'info,RandomnessV2>>,
    /// CHECK: winner is constrained by VRF index and committed Merkle leaf, never caller choice.
    #[account(mut)]pub winner:UncheckedAccount<'info>,
    #[account(address=vault.quote_mint)]pub quote_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(mut,associated_token::mint=quote_mint,associated_token::authority=vault,associated_token::token_program=token_program)]pub quote_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    #[account(init_if_needed,payer=payer,associated_token::mint=quote_mint,associated_token::authority=winner,associated_token::token_program=token_program)]pub winner_tokens:Box<InterfaceAccount<'info,TokenAccount>>,
    #[account(address=vault.mint)]pub base_mint:Box<InterfaceAccount<'info,Mint>>,
    #[account(mut,associated_token::mint=base_mint,associated_token::authority=vault,associated_token::token_program=base_token_program)]pub base_vault:Box<InterfaceAccount<'info,TokenAccount>>,
    #[account(init_if_needed,payer=payer,associated_token::mint=base_mint,associated_token::authority=winner,associated_token::token_program=base_token_program)]pub winner_base_tokens:Box<InterfaceAccount<'info,TokenAccount>>,
    pub base_token_program:Interface<'info,TokenInterface>,
    pub token_program:Interface<'info,TokenInterface>,pub associated_token_program:Program<'info,AssociatedToken>,pub system_program:Program<'info,System>
}
#[account]
#[derive(InitSpace)]
pub struct Config{pub snapshot_authority:Pubkey}
#[account]
#[derive(InitSpace)]
pub struct Vault{pub mint:Pubkey,pub creator:Pubkey,pub quote_mint:Pubkey,pub cycle_seconds:i64,pub next_due:i64,pub sequence:u64,pub pending:bool,pub bump:u8}
#[account]
#[derive(InitSpace)]
pub struct Round{pub vault:Pubkey,pub sequence:u64,pub root:[u8;32],pub count:u32,pub snapshot_slot:u64,pub reward:u64,pub base_reward:u64,pub randomness:Pubkey,pub seed:[u8;32],pub requester:Pubkey,pub paid:bool,pub winner:Pubkey,pub started_at:i64}
#[event]pub struct RoundOpened{pub vault:Pubkey,pub sequence:u64,pub root:[u8;32],pub count:u32,pub snapshot_slot:u64,pub reward:u64,pub randomness:Pubkey}
#[event]pub struct RoundPaid{pub vault:Pubkey,pub sequence:u64,pub winner:Pubkey,pub reward:u64,pub base_reward:u64}
#[error_code]
pub enum ErrorCode{InvalidConfig,InvalidFeeClaim,NotDue,InvalidSnapshot,InsufficientReward,WrongRandomness,RandomnessPending,InvalidProof,WrongWinner,AlreadyPaid,Overflow}

#[cfg(test)]mod tests{use super::*;
#[test]fn winner_is_deterministic_and_bounded(){for n in [1,2,3,97,1_000_000]{let a=select_winner(&[7;64],n).unwrap();assert!(a<n);assert_eq!(a,select_winner(&[7;64],n).unwrap())}assert!(select_winner(&[0;64],0).is_err());}
#[test]fn leaf_is_domain_bound(){let vault=Pubkey::new_unique();let wallet=Pubkey::new_unique();let a=holder_leaf(&vault,0,0,&wallet,1_000_000);assert_ne!(a,holder_leaf(&vault,1,0,&wallet,1_000_000));assert_ne!(a,holder_leaf(&vault,0,1,&wallet,1_000_000));assert_ne!(a,holder_leaf(&vault,0,0,&wallet,2_000_000));}
}
