'use client'

import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'

// Define ticket data type
export interface TicketData {
    id: string
    ticket_code: string
    attendee_name: string
    attendee_email: string
    event_title: string
    event_date: string
    event_venue: string
    tier_name?: string
    qr_code_url: string
    organizer_logo?: string
}

export type TicketSize = 'a4' | 'thermal' | 'wristband'

interface TicketPdfDocumentProps {
    tickets: TicketData[]
    size: TicketSize
}

// Styles for different sizes
const createStyles = (size: TicketSize) => {
    const baseStyles = {
        page: {
            padding: size === 'a4' ? 20 : size === 'thermal' ? 12 : 8,
            fontFamily: 'Helvetica',
            backgroundColor: '#ffffff',
        },
        ticketContainer: {
            border: '2px solid #e5e7eb',
            borderRadius: size === 'wristband' ? 4 : 12,
            overflow: 'hidden' as const,
            marginBottom: size === 'a4' ? 10 : 8,
            backgroundColor: '#ffffff',
        },
        headerGradient: {
            backgroundColor: '#6366f1',
            padding: size === 'wristband' ? 6 : size === 'thermal' ? 10 : 14,
            alignItems: 'center' as const,
        },
        eventTitle: {
            fontSize: size === 'wristband' ? 9 : size === 'thermal' ? 14 : 18,
            fontWeight: 'bold',
            color: '#ffffff',
            textAlign: 'center' as const,
            marginBottom: 2,
        },
        eventSubtitle: {
            fontSize: size === 'wristband' ? 6 : size === 'thermal' ? 9 : 11,
            color: '#e0e7ff',
            textAlign: 'center' as const,
        },
        contentSection: {
            padding: size === 'wristband' ? 6 : size === 'thermal' ? 10 : 14,
        },
        qrContainer: {
            alignItems: 'center' as const,
            marginVertical: size === 'wristband' ? 6 : 10,
            padding: size === 'wristband' ? 4 : 8,
            backgroundColor: '#f9fafb',
            borderRadius: 8,
        },
        qrCode: {
            width: size === 'wristband' ? 50 : size === 'thermal' ? 120 : 140,
            height: size === 'wristband' ? 50 : size === 'thermal' ? 120 : 140,
            border: '3px solid #6366f1',
            borderRadius: 8,
        },
        ticketCode: {
            fontSize: size === 'wristband' ? 7 : size === 'thermal' ? 10 : 12,
            fontWeight: 'bold',
            color: '#4b5563',
            marginTop: 6,
            letterSpacing: 1,
        },
        infoSection: {
            marginTop: 12,
            paddingTop: 12,
            borderTop: '1px dashed #d1d5db',
        },
        infoRow: {
            flexDirection: 'row' as const,
            marginBottom: size === 'wristband' ? 3 : 6,
            alignItems: 'center' as const,
        },
        infoLabel: {
            fontSize: size === 'wristband' ? 7 : size === 'thermal' ? 9 : 10,
            fontWeight: 'bold',
            color: '#6b7280',
            width: size === 'wristband' ? 45 : 90,
            textTransform: 'uppercase' as const,
        },
        infoValue: {
            fontSize: size === 'wristband' ? 7 : size === 'thermal' ? 10 : 11,
            color: '#111827',
            flex: 1,
        },
        tierBadge: {
            backgroundColor: '#dbeafe',
            color: '#1e40af',
            padding: size === 'wristband' ? 3 : 5,
            borderRadius: 4,
            fontSize: size === 'wristband' ? 7 : size === 'thermal' ? 9 : 10,
            fontWeight: 'bold',
            textAlign: 'center' as const,
            marginBottom: 8,
        },
        footer: {
            marginTop: 12,
            paddingTop: 8,
            borderTop: '1px solid #e5e7eb',
            flexDirection: 'row' as const,
            justifyContent: 'space-between' as const,
            alignItems: 'center' as const,
        },
        footerText: {
            fontSize: size === 'wristband' ? 6 : 8,
            color: '#9ca3af',
        },
        footerBrand: {
            fontSize: size === 'wristband' ? 7 : 9,
            fontWeight: 'bold',
            color: '#6366f1',
        },
    }

    return StyleSheet.create(baseStyles)
}

// Single ticket component
const Ticket: React.FC<{ ticket: TicketData; size: TicketSize }> = ({ ticket, size }) => {
    const styles = createStyles(size)

    // Special layout for wristband (horizontal)
    if (size === 'wristband') {
        return (
            <View style={styles.ticketContainer}>
                {/* Horizontal layout for wristband */}
                <View style={{ flexDirection: 'row', padding: 8, alignItems: 'center', gap: 8 }}>
                    {/* QR Code - Left Side */}
                    <View style={{ alignItems: 'center' }}>
                        <Image
                            src={ticket.qr_code_url}
                            style={{ width: 50, height: 50, border: '2px solid #6366f1', borderRadius: 4 }}
                        />
                    </View>

                    {/* Info - Center/Right */}
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#111827', marginBottom: 1 }}>
                            {ticket.event_title}
                        </Text>
                        <Text style={{ fontSize: 7, color: '#6b7280', marginBottom: 2 }}>
                            {ticket.event_date}
                        </Text>
                        <Text style={{ fontSize: 6, fontWeight: 'bold', color: '#6366f1', letterSpacing: 0.5 }}>
                            {ticket.ticket_code}
                        </Text>
                    </View>

                    {/* Brand - Right */}
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#6366f1' }}>
                            HangHut
                        </Text>
                    </View>
                </View>
            </View>
        )
    }

    // Standard vertical layout for A4 and Thermal
    return (
        <View style={styles.ticketContainer}>
            {/* Header with Gradient */}
            <View style={styles.headerGradient}>
                <Text style={styles.eventTitle}>{ticket.event_title}</Text>
                <Text style={styles.eventSubtitle}>{ticket.event_date}</Text>
            </View>

            {/* Content Section */}
            <View style={styles.contentSection}>
                {/* Tier Badge (if applicable) */}
                {ticket.tier_name && (
                    <View style={styles.tierBadge}>
                        <Text>{ticket.tier_name}</Text>
                    </View>
                )}

                {/* QR Code */}
                <View style={styles.qrContainer}>
                    <Image
                        src={ticket.qr_code_url}
                        style={styles.qrCode}
                    />
                    <Text style={styles.ticketCode}>{ticket.ticket_code}</Text>
                </View>

                {/* Attendee Details */}
                <View style={styles.infoSection}>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Name</Text>
                        <Text style={styles.infoValue}>{ticket.attendee_name}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Email</Text>
                        <Text style={styles.infoValue}>{ticket.attendee_email}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Venue</Text>
                        <Text style={styles.infoValue}>{ticket.event_venue}</Text>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Valid for single entry • Scan at gate</Text>
                    <Text style={styles.footerBrand}>HangHut</Text>
                </View>
            </View>
        </View>
    )
}

// Main PDF Document
export const TicketPdfDocument: React.FC<TicketPdfDocumentProps> = ({ tickets, size }) => {
    const styles = createStyles(size)

    // For A4, we can fit 4 tickets per page (2x2 grid)
    if (size === 'a4') {
        const ticketsPerPage = 4
        const pages = []
        for (let i = 0; i < tickets.length; i += ticketsPerPage) {
            const pageTickets = tickets.slice(i, i + ticketsPerPage)
            pages.push(
                <Page key={i} size="A4" style={styles.page}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {pageTickets.map((ticket, idx) => (
                            <View key={ticket.id} style={{ width: '48%' }}>
                                <Ticket ticket={ticket} size={size} />
                            </View>
                        ))}
                    </View>
                </Page>
            )
        }
        return <Document>{pages}</Document>
    }

    // For thermal and wristband, 1 ticket per page
    return (
        <Document>
            {tickets.map((ticket) => (
                <Page
                    key={ticket.id}
                    size={size === 'thermal' ? { width: 226.77, height: 400 } : { width: 400, height: 80 }}
                    style={styles.page}
                >
                    <Ticket ticket={ticket} size={size} />
                </Page>
            ))}
        </Document>
    )
}
