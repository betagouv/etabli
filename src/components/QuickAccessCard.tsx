import Button from '@mui/lab/LoadingButton';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Image, { StaticImageData } from 'next/image';
import NextLink from 'next/link';

const isRemoteUrl = (url: string | StaticImageData) => {
  try {
    return Boolean(new URL(url as unknown as string));
  } catch (e) {
    return false;
  }
};

export interface QuickAccessCardProps {
  image: StaticImageData | string;
  imageAlt: string;
  text: string;
  link: string;
}

export function QuickAccessCard(props: QuickAccessCardProps) {
  let isImageAnUrl: boolean = isRemoteUrl(props.image);

  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        maxWidth: '500px',
        p: 20,
      }}
    >
      {isImageAnUrl ? (
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '120px',
            my: 1,
          }}
        >
          <Image
            src={props.image}
            alt={props.imageAlt}
            fill={true}
            style={{
              objectFit: 'contain',
            }}
            data-sentry-block
          />
        </Box>
      ) : (
        <Image
          src={props.image}
          alt={props.imageAlt}
          style={{
            width: '100%',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      )}
      <Button component={NextLink} href={props.link} size="large" variant="contained" fullWidth sx={{ mt: 1 }} data-sentry-mask>
        {props.text}
      </Button>
    </Card>
  );
}
