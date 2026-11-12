import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { BillRead } from '@shared/lookup-contracts';
import { getBillImage } from '../api/supplier-lookup-api';
import { useLookup } from '../lookup/useLookup';
import { ReadState } from '../lookup/ReadUI';
import { theme } from '../theme';

/** A bill photo loaded with the login header (never a token in the URL). Tap to enlarge. */
export function BillPreview({ bill, compact = false }: { bill: Pick<BillRead, 'id' | 'branchId'> & Partial<BillRead>; compact?: boolean }) {
  const { client, key } = useLookup();
  const [large, setLarge] = useState(!compact);
  const image = useQuery({
    queryKey: key('bill-image', { id: bill.id }),
    queryFn: () => getBillImage(client, bill as BillRead),
    gcTime: 60_000,
  });
  return (
    <View style={{ gap: 8 }}>
      <ReadState query={image} />
      {image.data ? (
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={large ? 'Supplier bill photo, tap to shrink' : 'Supplier bill photo, tap to enlarge'}
          onPress={() => setLarge((value) => !value)}
        >
          <Image
            source={{ uri: image.data }}
            resizeMode="contain"
            style={{
              width: '100%',
              height: large ? 480 : 160,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.border,
            }}
          />
        </Pressable>
      ) : null}
      {compact && image.data ? (
        <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
          {large ? 'Tap the photo to shrink it.' : 'Tap the photo to read it.'}
        </Text>
      ) : null}
    </View>
  );
}
