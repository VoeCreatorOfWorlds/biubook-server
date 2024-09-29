import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { OnboardingStatus, KycStep } from './types';
import { AuthenticatedRequest } from './auth';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function kycStatusHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
    console.log(req.user)
  const userId = req.user?.user_id;

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    // Check if the user is a business or individual
    const { data: profileData, error: profileError } = await supabase
      .from('profile')
      .select('is_business')
      .eq('user_id', userId)
      .single();

    if (profileError) throw profileError;

    if (!profileData) {
      res.status(404).json({ error: 'User profile not found' });
      return;
    }

    const isBusiness = profileData.is_business;

    let kycStatus: string;
    let documentsUploaded: boolean;

    if (isBusiness) {
      const { data: businessKycData, error: businessKycError } = await supabase
        .from('business_kyc')
        .select('kyc_status, documents_uploaded')
        .eq('user_id', userId)
        .single();

      if (businessKycError) throw businessKycError;

      kycStatus = businessKycData?.kyc_status || 'not_started';
      documentsUploaded = businessKycData?.documents_uploaded || false;
    } else {
      const { data: userKycData, error: userKycError } = await supabase
        .from('user_kyc')
        .select('kyc_status, documents_uploaded')
        .eq('user_id', userId)
        .single();

      if (userKycError) throw userKycError;

      kycStatus = userKycData?.kyc_status || 'not_started';
      documentsUploaded = userKycData?.documents_uploaded || false;
    }

    const onboardingStatus: OnboardingStatus = {
      isComplete: kycStatus === 'approved',
      currentStep: determineCurrentStep(kycStatus, documentsUploaded, isBusiness)
    };
      
      console.log(
          "obs: ",
          onboardingStatus
      )

    res.status(200).json(onboardingStatus);
  } catch (error) {
    console.error('KYC status check error:', error);
    res.status(500).json({ error: 'Failed to check KYC status', details: (error as Error).message });
  }
}

function determineCurrentStep(kycStatus: string, documentsUploaded: boolean, isBusiness: boolean): KycStep {
  if (kycStatus === 'approved') {
    return 'complete';
  }

  if (documentsUploaded && kycStatus !== 'approved') {
    return 'verification_in_progress';
  }

  switch (kycStatus) {
    case 'not_started':
      return isBusiness ? 'business_kyc_start' : 'user_kyc_start';
    case 'pending':
      return isBusiness ? 'business_kyc_pending' : 'user_kyc_pending';
    case 'rejected':
      return isBusiness ? 'business_kyc_resubmit' : 'user_kyc_resubmit';
    default:
      return isBusiness ? 'business_kyc_start' : 'user_kyc_start';
  }
}